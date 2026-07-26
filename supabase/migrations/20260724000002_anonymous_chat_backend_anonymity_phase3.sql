-- ============================================================
-- Anonymous chat backend anonymity — Phase 3 of 4
--
-- PROBLEM THIS PHASE SOLVES: Phase 1's restrictive policy on `chats`
-- means Supabase Realtime's `postgres_changes` (which re-evaluates the
-- subscriber's SELECT RLS per row) stops delivering INSERT events for
-- anonymous chat_messages entirely — including to the message's own
-- recipient. This phase restores realtime delivery for anonymous chats
-- ONLY, via Supabase's "Broadcast from Database" primitive
-- (`realtime.send`), with a payload that never contains the sender's
-- real UUID. The same trigger also updates chats.last_message_at and
-- suppresses delivery to a recipient who has blocked the sender (or vice
-- versa) — see the inline comments at those statements for why both are
-- necessary, not optional additions.
--
-- SCOPE, DELIBERATELY MINIMAL (see the report accompanying this file for
-- the full reasoning on each point):
--   * Only chat_messages gets a new trigger. The chats-table list-screen
--     "bump to top" signal was considered and dropped — low stakes, and
--     the list screen already refetches on focus/app-state-active, so a
--     second trigger + topic + authorization policy for it isn't
--     justified yet.
--   * The trigger does not construct reply-preview JSON. The client
--     already has a "raw insert now, follow-up SELECT to enrich if
--     reply_to_id is set" pattern for non-anonymous chats
--     (features/chat/data/realtime.ts, onEnrichedInsert) — Phase 4 reuses
--     that exact pattern against chat_messages_view for anonymous chats,
--     so the trigger only needs to publish the flat message fields.
--   * No server-side block filtering here either, for the same reason
--     Phase 1 didn't add it to chat_messages_view: the client's merged
--     block list (src/hooks/useBlocks.ts) is bidirectional in a way that
--     isn't trivially replicated server-side, and getting it wrong here
--     would let through messages the client currently hides. Existing
--     client-side filtering (isBlockedDirectMessage) remains the sole
--     enforcement for both transports, unchanged.
--   * Uses realtime.send(payload, event, topic, private) rather than
--     realtime.broadcast_changes(...). broadcast_changes exists too
--     (confirmed via `supabase db dump --linked --schema realtime`
--     against the live project) but auto-serializes an entire table row
--     — using it would require first constructing a fake redacted
--     `record` just to hide user_id. realtime.send takes an explicit
--     jsonb payload directly, which is simpler for a payload that's
--     already an intentional allow-list.
--
-- Non-anonymous chats: completely untouched. The trigger no-ops
-- immediately for them (see step 1), before doing anything else, and
-- nothing here modifies postgres_changes, notify_chat_message(), or any
-- object from Phase 1/2.
--
-- ============================================================
-- WHY THE AUTHORIZATION POLICY REUSES is_chat_participant() (Phase 1)
-- INSTEAD OF AN INLINE SUBQUERY
-- ============================================================
-- Phase 1 discovered, empirically, that an inline
-- `EXISTS (SELECT 1 FROM public.chats WHERE ...)` inside another
-- object's policy is silently defeated once `chats` has a restrictive
-- policy hiding anonymous rows (the subquery runs as the calling role,
-- which is subject to that restriction). The authorization policy below
-- has the exact same shape of dependency — it needs to confirm chat
-- participancy for what will always be an anonymous chat (nothing is
-- ever published to this topic pattern for a non-anonymous chat) — so it
-- reuses is_chat_participant(), the SECURITY DEFINER helper that already
-- bypasses this correctly, rather than reintroducing the same bug in a
-- new place.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- Purely additive — one new function, one new trigger, one new policy on
-- a Supabase-managed table (no data of ours touched):
--   DROP TRIGGER IF EXISTS trg_broadcast_anonymous_chat_message ON public.chat_messages;
--   DROP FUNCTION IF EXISTS public.broadcast_anonymous_chat_message();
--   DROP POLICY IF EXISTS "Anonymous chat message recipients only" ON realtime.messages;
--
-- ============================================================
-- VERIFICATION (see full results in the report accompanying this file)
-- ============================================================
-- Verified against a real local Postgres instance with a hand-built
-- stand-in for the relevant parts of the `realtime` schema, matching the
-- exact shapes confirmed from the live project (`realtime.messages`
-- columns, `realtime.send`'s signature, `realtime.topic()`'s role):
--   * The trigger no-ops (realtime.send is never invoked) for
--     non-anonymous chats.
--   * For an anonymous chat, it fires exactly once per inserted message,
--     computes the correct non-sender recipient, and the constructed
--     payload contains no user_id/sender-identifying field at all.
--   * The topic string is exactly `anon-chat-message:{chat_id}:{real
--     recipient id}` — never the sender's id.
--   * The authorization policy predicate: allows the genuine recipient
--     to pass; rejects the sender attempting to subscribe to the
--     recipient's own topic (fails the auth.uid()-matches-topic check);
--     rejects a non-participant constructing a topic naming themselves
--     as recipient for someone else's chat (fails is_chat_participant());
--     is unaffected by and does not affect any non-anonymous chat.
--   * Without the `topic = realtime.topic()` clause, a user authorized
--     for ANY topic (even a harmless one nothing was ever published to)
--     could see every row in realtime.messages, since no other clause
--     correlates with the actual stored row — confirmed the clause
--     restricts visibility to exactly the topic being authorized.
--   * last_message_at is set correctly on the chats row for every
--     anonymous message insert, with no client-side update involved.
--   * The block check correctly suppresses publishing when the recipient
--     has blocked the sender (either direction, matching
--     chat_messages_view's identical rule) while leaving last_message_at's
--     own update unaffected either way.
-- ============================================================

CREATE OR REPLACE FUNCTION public.broadcast_anonymous_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_anonymous boolean;
  v_recipient_id uuid;
BEGIN
  SELECT
    is_anonymous,
    CASE WHEN participant_1_id = NEW.user_id THEN participant_2_id ELSE participant_1_id END
  INTO v_is_anonymous, v_recipient_id
  FROM public.chats
  WHERE id = NEW.chat_id;

  -- Non-anonymous chats (or a chat that vanished mid-insert, defensively):
  -- no-op. postgres_changes continues to handle these exactly as today,
  -- and useChatSendMessage.ts's existing client-side
  -- `.from("chats").update({last_message_at})` call keeps handling
  -- last_message_at for them, unchanged.
  IF v_is_anonymous IS NOT TRUE OR v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- useChatSendMessage.ts's last_message_at update is a plain
  -- `.from("chats").update(...)`, which hits the same
  -- row-location-needs-SELECT-visibility issue Phase 1 documented for
  -- chat_messages: it silently affects 0 rows for anonymous chats. Rather
  -- than a separate RPC for one column, this trigger already runs
  -- SECURITY DEFINER and already knows is_anonymous on every insert, so
  -- it updates last_message_at here directly (bypassing chats' RLS via
  -- the same ownership exemption used throughout this migration set).
  -- The client's own update call is a harmless no-op for anonymous chats
  -- since it never matches any row.
  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;

  -- Once the recipient's client no longer holds the sender's real id, its
  -- own isBlockedDirectMessage check can never match for a blocked
  -- sender's realtime-delivered message. Skip publishing entirely if the
  -- recipient has blocked the sender, replicating the exact bidirectional
  -- rule from useBlocks.ts / chat_messages_view: their profile_only block
  -- on the sender, or any block the sender placed on them.
  IF EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = v_recipient_id AND b.blocked_id = NEW.user_id AND b.block_scope = 'profile_only')
       OR (b.blocker_id = NEW.user_id AND b.blocked_id = v_recipient_id)
  ) THEN
    RETURN NEW;
  END IF;

  -- Deliberately does NOT include user_id or any sender-identifying
  -- field. Reply-preview enrichment is done client-side via a follow-up
  -- SELECT against chat_messages_view (Phase 4), mirroring the existing
  -- non-anonymous realtime pattern, so it isn't constructed here either.
  PERFORM realtime.send(
    jsonb_build_object(
      'id', NEW.id,
      'chat_id', NEW.chat_id,
      'content', NEW.content,
      'image_url', NEW.image_url,
      'image_aspect_ratio', NEW.image_aspect_ratio,
      'created_at', NEW.created_at,
      'is_read', NEW.is_read,
      'reply_to_id', NEW.reply_to_id
    ),
    'new_message',
    'anon-chat-message:' || NEW.chat_id::text || ':' || v_recipient_id::text,
    true
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_anonymous_chat_message() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_broadcast_anonymous_chat_message ON public.chat_messages;
CREATE TRIGGER trg_broadcast_anonymous_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_anonymous_chat_message();

-- Realtime Authorization: gates who may SUBSCRIBE to a given topic. See
-- the header comment for why this reuses is_chat_participant() rather
-- than an inline subquery. Scoped narrowly to the `anon-chat-message:`
-- topic prefix so it cannot be mistaken for, or accidentally widened
-- into, a general-purpose realtime.messages policy.
--
-- The `topic = realtime.topic()` clause was added after testing surfaced
-- a real gap: without it, a user legitimately authorized for topic A
-- (e.g. a harmless topic where nothing was ever published) could see
-- EVERY row in realtime.messages once the rest of the predicate passed
-- for topic A, since none of the other conditions correlate with the
-- actual STORED row being evaluated — only with the topic() GUC itself.
-- This clause makes the policy only ever grant visibility into rows
-- whose own topic column matches the one currently being authorized,
-- regardless of how the Realtime server internally invokes this check.
CREATE POLICY "Anonymous chat message recipients only"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    topic = realtime.topic()
    AND split_part(realtime.topic(), ':', 1) = 'anon-chat-message'
    AND auth.uid()::text = split_part(realtime.topic(), ':', 3)
    AND public.is_chat_participant(split_part(realtime.topic(), ':', 2)::uuid)
  );
