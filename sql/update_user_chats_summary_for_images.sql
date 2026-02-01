-- Add last_message_has_image and exclude empty chats from user_chats_summary.
-- Run this in Supabase SQL Editor.

CREATE OR REPLACE VIEW public.user_chats_summary AS
SELECT
  c.id AS chat_id,
  c.participant_1_id,
  c.participant_2_id,
  c.post_id,
  c.created_at,
  c.last_message_at,
  ( SELECT chat_messages.content
    FROM chat_messages
    WHERE chat_messages.chat_id = c.id
    ORDER BY chat_messages.created_at DESC
    LIMIT 1) AS last_message_content,
  ( SELECT count(*)
    FROM chat_messages
    WHERE chat_messages.chat_id = c.id
      AND chat_messages.user_id <> c.participant_1_id
      AND chat_messages.is_read = false) AS unread_count_p1,
  ( SELECT count(*)
    FROM chat_messages
    WHERE chat_messages.chat_id = c.id
      AND chat_messages.user_id <> c.participant_2_id
      AND chat_messages.is_read = false) AS unread_count_p2,
  ( SELECT (chat_messages.image_url IS NOT NULL AND chat_messages.image_url <> '')
    FROM chat_messages
    WHERE chat_messages.chat_id = c.id
    ORDER BY chat_messages.created_at DESC
    LIMIT 1) AS last_message_has_image
FROM chats c
WHERE EXISTS (
  SELECT 1
  FROM chat_messages
  WHERE chat_messages.chat_id = c.id
);
