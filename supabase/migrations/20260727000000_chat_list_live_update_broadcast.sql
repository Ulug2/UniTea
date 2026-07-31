-- ============================================================
-- Bug A fix: chat list screen has no live-update path for anonymous
-- chats while already open.
-- ============================================================
--
-- ROOT CAUSE (investigation, no code changed yet at time of writing)
--
-- The chat list screen (chat.tsx) relies entirely on `postgres_changes`
-- events on the `chats` table to know a message arrived (it bumps
-- last_message_at, which the list subscribes to). But once the anonymous
-- chat backend-anonymity work shipped, Realtime's `postgres_changes`
-- stops firing for anonymous chat rows entirely -- it respects the same
-- restrictive RLS that hides those rows from direct table reads. The
-- original design for this (see the Phase 3 migration's own header
-- comment) called for a lightweight per-user broadcast topic
-- (`chats:{user_id}`) as the fallback signal for exactly this case, but it
-- was never actually built -- only `useFocusEffect` (refetch when
-- navigating onto the tab) exists today, which does nothing if the user
-- is already sitting on the screen.
--
-- FIX
--
-- broadcast_anonymous_chat_message() (already fires on every anonymous
-- chat_messages insert, already computes the recipient, already has the
-- block-check gate) now ALSO sends a minimal signal -- {chat_id,
-- last_message_at} -- to a `chats:{user_id}` topic for BOTH the recipient
-- and the sender (the sender is included too so a second device signed
-- into the same account also updates live; harmless no-op otherwise,
-- their own client already knows what it just sent). The signal carries
-- no message content and no participant identity beyond the topic's own
-- embedded user id, matching the minimal-payload approach already used
-- for the per-message topic.
--
-- New Realtime Authorization policy, mirroring the existing
-- "Anonymous chat message recipients only" policy pattern exactly: scoped
-- to the `chats:` topic prefix, requires the topic's embedded user id to
-- equal auth.uid(), and includes the `topic = realtime.topic()` guard
-- (the same gap that pattern was built to close previously) so a caller
-- authorized for one topic can't see rows stored under a different one.
-- This policy is simpler than the message-level one -- no chat
-- participancy check is needed, since the topic only ever encodes "this
-- is your own per-user list-refresh channel", not a specific
-- conversation.
--
-- Client side (separate commit, no new DB objects): the chat list screen
-- subscribes to `chats:{currentUserId}` the same way the chat detail
-- screen already subscribes to its per-message topic, and reacts to this
-- signal by reordering instantly from the payload's last_message_at, then
-- fetching the fresh row from user_chats_summary the same way the
-- existing non-anonymous postgres_changes UPDATE handler already does.
-- Non-anonymous chats are unaffected -- postgres_changes still fires for
-- them exactly as before; this signal is purely additive.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP POLICY IF EXISTS "Chat list refresh signal recipients only" ON realtime.messages;
-- Then re-run 20260726000003_scope_anonymous_blocks_to_specific_chat.sql's
-- broadcast_anonymous_chat_message() verbatim to drop the two new
-- realtime.send calls.
--
-- ============================================================
-- VERIFICATION
-- ============================================================
-- Verified against a real local Postgres instance (Realtime schema
-- stand-in, same methodology as the rest of this migration set):
--   * Inserting a chat_messages row for an anonymous chat produces TWO
--     new realtime.messages rows: the existing per-message
--     'anon-chat-message:{chatId}:{recipientId}' broadcast, and the new
--     'chats:{recipientId}' signal carrying {chat_id, last_message_at}.
--   * A matching 'chats:{senderId}' signal is also produced.
--   * When the sender is blocked (or has blocked the recipient) for that
--     specific chat, neither the per-message broadcast nor the new list
--     signal is sent (both gated by the same existing block check).
--   * The new realtime.messages policy: a user authorized for their own
--     'chats:{their_id}' topic can read rows stored under it; a user
--     attempting to read a DIFFERENT user's 'chats:{other_id}' topic is
--     rejected.
--   * Non-anonymous chat message inserts are completely unaffected -- the
--     trigger still no-ops for them before reaching any realtime.send call.
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

  IF v_is_anonymous IS NOT TRUE OR v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;

  IF EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = v_recipient_id AND b.blocked_id = NEW.user_id
           AND b.block_scope = 'anonymous_only' AND b.related_chat_id = NEW.chat_id)
       OR (b.blocker_id = NEW.user_id AND b.blocked_id = v_recipient_id
           AND b.block_scope = 'anonymous_only' AND b.related_chat_id = NEW.chat_id)
  ) THEN
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

  -- Bug A fix: the chat LIST screen has no other live-update path for
  -- anonymous chats (postgres_changes never fires for them). This minimal
  -- signal lets it reorder/refresh this one chat immediately instead of
  -- waiting for the next screen focus or manual refresh. Sent to both
  -- sides -- the recipient (the actual point of this fix) and the sender
  -- (so a second device on the same account also stays live; a no-op
  -- otherwise since the sender's own client already has this data).
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

CREATE POLICY "Chat list refresh signal recipients only"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    topic = realtime.topic()
    AND split_part(realtime.topic(), ':', 1) = 'chats'
    AND auth.uid()::text = split_part(realtime.topic(), ':', 2)
  );
