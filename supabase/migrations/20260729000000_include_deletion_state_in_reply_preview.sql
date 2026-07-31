-- Bug found during two-device testing of the unified deletion RPC
-- (20260728000000_unify_chat_message_deletion_rpc.sql): when user B deletes
-- a message "for everyone" that user A had replied to, A's (and B's) reply
-- quote block kept showing the original content/image forever instead of
-- "This message was deleted".
--
-- Root cause: chat_messages_view's `reply_message` jsonb (the denormalised
-- snapshot embedded in a reply bubble) only ever carried
-- {id, content, image_url, user_id} for the replied-to row — it never
-- included that row's own deleted_by_sender/deleted_by_receiver flags, so
-- the client had no way to know the quoted message had since been deleted.
-- The same gap existed in the non-anonymous send path's FK-embed
-- (`reply_message:reply_to_id(...)` in useChatSendMessage.ts) and the
-- non-anonymous realtime enrichment fetch (data/realtime.ts) — fixed in the
-- same client-side pass as this migration, not here.
--
-- Fix: add deleted_by_sender/deleted_by_receiver to the reply_message jsonb.
-- The view's column list is unchanged (still returns the same top-level
-- columns), only the jsonb payload gains two keys, so this is a pure
-- CREATE OR REPLACE with no grant/permission changes required — redone
-- explicitly below anyway for consistency with every other view migration
-- in this project.

CREATE OR REPLACE VIEW public.chat_messages_view
WITH (security_invoker = false) AS
SELECT
  cm.id,
  cm.chat_id,
  CASE
    WHEN c.is_anonymous AND cm.user_id <> auth.uid() THEN NULL
    ELSE cm.user_id
  END AS user_id,
  cm.content,
  cm.is_read,
  cm.created_at,
  cm.deleted_by_sender,
  cm.deleted_by_receiver,
  cm.image_url,
  cm.reply_to_id,
  cm.image_aspect_ratio,
  CASE
    WHEN rm.id IS NULL THEN NULL
    ELSE jsonb_build_object(
      'id', rm.id,
      'content', rm.content,
      'image_url', rm.image_url,
      'user_id', CASE
        WHEN c.is_anonymous AND rm.user_id <> auth.uid() THEN NULL
        ELSE rm.user_id
      END,
      'deleted_by_sender', rm.deleted_by_sender,
      'deleted_by_receiver', rm.deleted_by_receiver
    )
  END AS reply_message
FROM public.chat_messages cm
JOIN public.chats c ON c.id = cm.chat_id
LEFT JOIN public.chat_messages rm ON rm.id = cm.reply_to_id AND rm.chat_id = cm.chat_id
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = cm.user_id
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
       OR (b.blocker_id = cm.user_id AND b.blocked_id = auth.uid()
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
  );

REVOKE ALL ON public.chat_messages_view FROM PUBLIC;
GRANT SELECT ON public.chat_messages_view TO authenticated;
