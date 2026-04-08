-- ============================================================
-- Migration: Add pseudo-anonymous chat support
--
-- Adds is_anonymous and initiator_id columns to chats so the UI
-- can mask participant identities while preserving real IDs for
-- moderation (blocking / reporting).
-- ============================================================

-- 1. New columns on chats
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS initiator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Partial index for the hook's "existing anonymous chat?" lookup
CREATE INDEX IF NOT EXISTS idx_chats_anon_lookup
  ON public.chats (post_id, initiator_id)
  WHERE is_anonymous = true;

-- 3. Recreate user_chats_summary view with the two new columns
CREATE OR REPLACE VIEW public.user_chats_summary AS
SELECT
  c.id AS chat_id,
  c.participant_1_id,
  c.participant_2_id,
  c.post_id,
  c.created_at,
  c.last_message_at,

  -- Last visible message content for participant 1
  (SELECT
    CASE
      WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
        CASE
          WHEN cm.user_id = c.participant_1_id THEN 'You deleted this message'
          ELSE 'This message was deleted'
        END
      ELSE cm.content
    END
   FROM chat_messages cm
   WHERE cm.chat_id = c.id
     AND (
       COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
       OR NOT (
         cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false)
         OR cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false)
       )
     )
   ORDER BY cm.created_at DESC
   LIMIT 1
  ) AS last_message_content_p1,

  -- Last visible message has image for participant 1
  (SELECT
    CASE
      WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
      ELSE cm.image_url IS NOT NULL AND cm.image_url <> ''
    END
   FROM chat_messages cm
   WHERE cm.chat_id = c.id
     AND (
       COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
       OR NOT (
         cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false)
         OR cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false)
       )
     )
   ORDER BY cm.created_at DESC
   LIMIT 1
  ) AS last_message_has_image_p1,

  -- Last visible message content for participant 2
  (SELECT
    CASE
      WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
        CASE
          WHEN cm.user_id = c.participant_2_id THEN 'You deleted this message'
          ELSE 'This message was deleted'
        END
      ELSE cm.content
    END
   FROM chat_messages cm
   WHERE cm.chat_id = c.id
     AND (
       COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
       OR NOT (
         cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false)
         OR cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false)
       )
     )
   ORDER BY cm.created_at DESC
   LIMIT 1
  ) AS last_message_content_p2,

  -- Last visible message has image for participant 2
  (SELECT
    CASE
      WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
      ELSE cm.image_url IS NOT NULL AND cm.image_url <> ''
    END
   FROM chat_messages cm
   WHERE cm.chat_id = c.id
     AND (
       COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
       OR NOT (
         cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false)
         OR cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false)
       )
     )
   ORDER BY cm.created_at DESC
   LIMIT 1
  ) AS last_message_has_image_p2,

  -- Unread count for participant 1 (messages sent by p2 that p1 hasn't read)
  (SELECT count(*)
   FROM chat_messages cm
   WHERE cm.chat_id = c.id
     AND cm.user_id = c.participant_2_id
     AND cm.is_read = false
     AND NOT COALESCE(cm.deleted_by_receiver, false)
  ) AS unread_count_p1,

  -- Unread count for participant 2 (messages sent by p1 that p2 hasn't read)
  (SELECT count(*)
   FROM chat_messages cm
   WHERE cm.chat_id = c.id
     AND cm.user_id = c.participant_1_id
     AND cm.is_read = false
     AND NOT COALESCE(cm.deleted_by_receiver, false)
  ) AS unread_count_p2,

  -- New columns appended at the end to preserve existing column order
  c.is_anonymous,
  c.initiator_id

FROM chats c
WHERE EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.chat_id = c.id);

-- 4. Re-apply security settings on the recreated view
ALTER VIEW public.user_chats_summary SET (security_invoker = true);
REVOKE ALL ON public.user_chats_summary FROM PUBLIC;
GRANT SELECT ON public.user_chats_summary TO authenticated;
