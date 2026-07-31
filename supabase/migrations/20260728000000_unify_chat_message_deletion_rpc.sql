-- ============================================================
-- Unify message deletion into a single server-side RPC for both
-- anonymous and non-anonymous chats.
-- ============================================================
--
-- CONTEXT
--
-- This migration was originally "add a deletion broadcast for anonymous
-- chats only". Before it was ever deployed, a follow-up architectural
-- review asked a broader question: does the split between an
-- anonymous-only RPC (set_anonymous_chat_message_deletion) and a
-- non-anonymous direct client `.update()` on chat_messages still make
-- sense, now that BOTH need a deletion signal delivered to the chat list
-- screen?
--
-- Two problems with keeping them separate:
--
--   1. The non-anonymous path enforced "only the sender may delete for
--      everyone" ENTIRELY client-side (useChatMessageActions.ts's
--      `if (action === 'delete_for_everyone' && !isSender) throw`). The
--      chat_messages UPDATE policy
--      ("Users can update messages in their chats") allows ANY chat
--      participant to set deleted_by_sender/deleted_by_receiver on ANY
--      message in a chat they're part of -- including someone else's
--      message. A client that skips the app's own check (or calls the
--      REST/JS API directly) could delete-for-everyone a message they
--      didn't send. This was a real, exploitable server-side gap, not a
--      hypothetical.
--
--   2. Giving the non-anonymous path a deletion signal (see prior
--      investigation) requires an explicit, intent-aware call site --
--      the same reason a generic trigger was already rejected for the
--      anonymous broadcast, below. A direct client `.update()` has no
--      such call site by construction.
--
-- Both problems disappear if deletion for BOTH chat types goes through
-- one RPC that already knows the caller's exact intent and can enforce
-- it server-side. This migration replaces
-- set_anonymous_chat_message_deletion with set_chat_message_deletion,
-- deletes the old function, and locks down direct-table access to the
-- deletion-flag columns so the RPC is the only way to change them --
-- closing problem (1) for real, not just in the app's own client code.
--
-- ROOT CAUSE OF THE MISSING LIST-REFRESH SIGNAL (unchanged from the
-- original investigation)
--
-- A soft delete is an UPDATE to chat_messages.deleted_by_sender /
-- deleted_by_receiver. Nothing in this codebase ever pushed that update
-- to the OTHER participant's chat-list screen:
--   * Non-anonymous chats: the open-conversation screen already receives
--     the UPDATE live via postgres_changes (chat_messages, event: "*",
--     fixed in the previous phase) -- but the chat LIST screen only
--     listens for `chats` table events, and nothing ever touches a
--     `chats` row on deletion.
--   * Anonymous chats: postgres_changes never fires for these rows at
--     all (restrictive RLS, same as direct reads). The existing
--     `message_deleted` broadcast (this migration's earlier draft)
--     reaches the open-conversation screen's per-message topic, but not
--     the list screen's `chats:{user_id}` topic.
--
-- "Delete for me" is intentionally unaffected: it only ever sets the
-- CALLER's own flag, so nothing changes on the other participant's side
-- for that action -- there is nothing to push, for either the message
-- view or the list.
--
-- FIX -- designs considered and rejected
--
-- (a) A dummy `chats.updated_at` column touched by a chat_messages
--     trigger purely to give postgres_changes something to fire on.
--     Rejected: a database write that exists solely to manufacture a
--     Realtime event couples business schema to transport mechanics, and
--     was explicitly ruled out.
--
-- (b) A generic `AFTER UPDATE` trigger on chat_messages, inferring
--     "delete for everyone" from an OLD/NEW flag diff. Rejected (same
--     reasoning as the original anonymous-only draft of this migration):
--     a message can reach deleted_by_sender = deleted_by_receiver = true
--     two different ways -- one atomic "delete for everyone", or two
--     independent "delete for me" calls converging on the same final
--     state -- and a trigger diffing OLD/NEW cannot reliably tell these
--     apart. The RPC below already knows the caller's exact intent
--     (p_action = 'delete_for_everyone'); inferring it a second time from
--     row state is redundant and strictly less reliable.
--
-- FIX -- what this migration does
--
-- set_chat_message_deletion() is the single entry point for both delete
-- actions, for both chat types. In the delete_for_everyone branch, after
-- verifying the caller is the original sender (server-side, not
-- trusted from the client), it:
--   * Anonymous chats: sends the existing 'message_deleted' broadcast on
--     the per-message topic (unchanged from the prior draft) PLUS a
--     'chat_updated' broadcast on the existing `chats:{user_id}` topic
--     (recipient and caller) -- the exact channel/topic/authorization
--     policy already built for anonymous chat_messages INSERTs
--     (20260727000000_chat_list_live_update_broadcast.sql). No new topic,
--     no new policy.
--   * Non-anonymous chats: sends only the 'chat_updated' broadcast, on
--     the SAME `chats:{user_id}` topic. The open-conversation screen
--     doesn't need a broadcast for message content -- the UPDATE this
--     function performs is already delivered to it "for free" via the
--     existing postgres_changes subscription, since RLS still allows a
--     non-anonymous chat's own participants to see their own rows.
--
-- The client already handles a `chat_updated` payload with no
-- `last_message_at` key correctly: patchLastMessageAtAndSort() falls back
-- to the existing cached value instead of reordering
-- (`lastMessageAt || updated[chatIndex].last_message_at`), and
-- applyFreshChatSummary() re-derives the correct preview text from
-- user_chats_summary regardless. So the payload here is deliberately
-- `{chat_id}` only -- no client-side changes are needed for either chat
-- type to pick this signal up.
--
-- SERVER-SIDE AUTHORIZATION (closes the gap described above)
--
-- set_chat_message_deletion() raises if the caller isn't the message's
-- sender and the action is delete_for_everyone -- for BOTH chat types
-- now, not just anonymous. To make this the actual source of truth
-- (not just an additional check alongside a still-permissive table
-- policy), direct client UPDATE access to the two deletion-flag columns
-- is revoked from `authenticated` at the column level; only `is_read`
-- remains directly updatable (still used by the client for marking
-- non-anonymous messages read -- see useChatMessagesRealtime.ts and
-- chat/[id].tsx, both unaffected by this migration). The RPC itself is
-- SECURITY DEFINER, so it is unaffected by this revoke -- it runs with
-- the function owner's privileges, the same pattern already used
-- throughout this schema (see block_chat_partner, initiate_anonymous_chat).
--
-- is_anonymous_chat_relationship_blocked(): the block-check gating the
-- anonymous broadcasts is identical to the one already in
-- broadcast_anonymous_chat_message() (avoid sending to/about a blocked
-- relationship for this specific chat) -- unchanged from the prior draft
-- of this migration, kept as the shared predicate both functions call.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- GRANT UPDATE ON public.chat_messages TO authenticated;
-- DROP FUNCTION IF EXISTS public.set_chat_message_deletion(uuid, text);
-- DROP FUNCTION IF EXISTS public.is_anonymous_chat_relationship_blocked(uuid, uuid, uuid);
-- Then re-run 20260726000003_scope_anonymous_blocks_to_specific_chat.sql's
-- broadcast_anonymous_chat_message() and
-- 20260724000003_..._phase4_db.sql's set_anonymous_chat_message_deletion()
-- verbatim, and restore the direct `.update()` call in
-- useChatMessageActions.ts for the non-anonymous branch.
--
-- ============================================================
-- VERIFICATION
-- ============================================================
-- Verified against a real local Postgres instance, as the `authenticated`
-- role (not superuser -- RLS/grant bugs are invisible to superuser):
--   * Sender calls delete_for_everyone (anonymous) -> 'message_deleted' on
--     the per-message topic AND 'chat_updated' on chats:{recipient} and
--     chats:{sender}.
--   * Sender calls delete_for_everyone (non-anonymous) -> 'chat_updated'
--     on chats:{recipient} and chats:{sender}, no 'message_deleted'
--     broadcast (postgres_changes already covers the open conversation).
--   * Recipient (non-sender) calls delete_for_everyone -> RAISES, no row
--     changed, no broadcast of any kind, for both chat types.
--   * delete_for_me (either side, either chat type) -> only the caller's
--     own flag changes, no broadcast of any kind.
--   * A blocked relationship on an anonymous chat -> no broadcast at all
--     for that chat (same gate as the insert path).
--   * Attempting `UPDATE chat_messages SET deleted_by_sender = true ...`
--     directly as `authenticated` (bypassing the RPC) -> rejected with a
--     column-privilege error, for both chat types.
--   * Attempting `UPDATE chat_messages SET is_read = true ...` directly
--     as `authenticated` -> still succeeds (column grant retained).
--   * broadcast_anonymous_chat_message()'s own insert-broadcast block gate
--     still behaves identically (unchanged from the prior draft).
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_anonymous_chat_relationship_blocked(
  p_chat_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b
           AND b.block_scope = 'anonymous_only' AND b.related_chat_id = p_chat_id)
       OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a
           AND b.block_scope = 'anonymous_only' AND b.related_chat_id = p_chat_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_anonymous_chat_relationship_blocked(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_anonymous_chat_relationship_blocked(uuid, uuid, uuid) TO authenticated;

-- Unchanged from the prior draft: still only touches anonymous inserts,
-- still calls the shared block predicate above instead of repeating the
-- EXISTS(...) inline.
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

  IF v_is_anonymous IS NOT TRUE OR v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;

  IF public.is_anonymous_chat_relationship_blocked(NEW.chat_id, NEW.user_id, v_recipient_id) THEN
    RETURN NEW;
  END IF;

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

  PERFORM realtime.send(
    jsonb_build_object(
      'chat_id', NEW.chat_id,
      'last_message_at', NEW.created_at
    ),
    'chat_updated',
    'chats:' || v_recipient_id::text,
    true
  );

  PERFORM realtime.send(
    jsonb_build_object(
      'chat_id', NEW.chat_id,
      'last_message_at', NEW.created_at
    ),
    'chat_updated',
    'chats:' || NEW.user_id::text,
    true
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_anonymous_chat_message() FROM PUBLIC;

-- Replaces set_anonymous_chat_message_deletion. Single entry point for
-- both delete_for_me and delete_for_everyone, for both chat types.
CREATE OR REPLACE FUNCTION public.set_chat_message_deletion(p_message_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_chat_id uuid;
  v_sender_id uuid;
  v_is_anonymous boolean;
  v_recipient_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_action NOT IN ('delete_for_me', 'delete_for_everyone') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  SELECT chat_id, user_id INTO v_chat_id, v_sender_id
  FROM public.chat_messages
  WHERE id = p_message_id;

  IF v_chat_id IS NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  IF NOT public.is_chat_participant(v_chat_id) THEN
    RAISE EXCEPTION 'you are not a participant of this chat';
  END IF;

  IF p_action = 'delete_for_everyone' THEN
    -- Server-side source of truth: the client's own isSender check is UI
    -- convenience only (e.g. deciding which action-sheet options to show).
    -- This is what actually stops a non-sender participant from deleting
    -- someone else's message for everyone -- for both chat types.
    IF v_sender_id <> v_caller_id THEN
      RAISE EXCEPTION 'only the sender can delete a message for everyone';
    END IF;

    UPDATE public.chat_messages
    SET deleted_by_sender = true, deleted_by_receiver = true
    WHERE id = p_message_id;

    SELECT is_anonymous,
      CASE WHEN participant_1_id = v_caller_id THEN participant_2_id
           WHEN participant_2_id = v_caller_id THEN participant_1_id
           ELSE NULL
      END
    INTO v_is_anonymous, v_recipient_id
    FROM public.chats
    WHERE id = v_chat_id;

    IF v_recipient_id IS NULL THEN
      RETURN;
    END IF;

    IF v_is_anonymous THEN
      IF public.is_anonymous_chat_relationship_blocked(v_chat_id, v_caller_id, v_recipient_id) THEN
        RETURN;
      END IF;

      -- Open-conversation screen: anonymous chats have no postgres_changes
      -- path at all, so this is the only way that screen learns of the
      -- deletion.
      PERFORM realtime.send(
        jsonb_build_object(
          'id', p_message_id,
          'deleted_by_sender', true,
          'deleted_by_receiver', true
        ),
        'message_deleted',
        'anon-chat-message:' || v_chat_id::text || ':' || v_recipient_id::text,
        true
      );
    END IF;

    -- List screen, both chat types: same channel/topic/policy already
    -- built for anonymous chat_messages INSERTs. Non-anonymous chats'
    -- open-conversation screen does not need an equivalent broadcast --
    -- the UPDATE above is already delivered to it via the existing
    -- postgres_changes subscription.
    PERFORM realtime.send(
      jsonb_build_object('chat_id', v_chat_id),
      'chat_updated',
      'chats:' || v_recipient_id::text,
      true
    );

    PERFORM realtime.send(
      jsonb_build_object('chat_id', v_chat_id),
      'chat_updated',
      'chats:' || v_caller_id::text,
      true
    );
  ELSE
    -- delete_for_me: only ever touches the caller's own flag. Nothing
    -- changes for the other participant, so nothing to broadcast.
    IF v_sender_id = v_caller_id THEN
      UPDATE public.chat_messages SET deleted_by_sender = true WHERE id = p_message_id;
    ELSE
      UPDATE public.chat_messages SET deleted_by_receiver = true WHERE id = p_message_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_chat_message_deletion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_chat_message_deletion(uuid, text) TO authenticated;

-- Never deployed under its old name (set_anonymous_chat_message_deletion
-- first shipped in this same uncommitted migration set) -- dropped here
-- so no caller can reach the pre-unification, anonymous-only, client-
-- trusted-sender version.
DROP FUNCTION IF EXISTS public.set_anonymous_chat_message_deletion(uuid, text);

-- Column-level lockdown: deleted_by_sender/deleted_by_receiver can now
-- ONLY be changed by set_chat_message_deletion() (SECURITY DEFINER, runs
-- as the function owner, unaffected by this revoke). is_read remains
-- directly updatable by clients -- unrelated to deletion, still written
-- directly by non-anonymous mark-as-read flows.
REVOKE UPDATE ON public.chat_messages FROM authenticated;
GRANT UPDATE (is_read) ON public.chat_messages TO authenticated;
