-- Add reply_to_id column to chat_messages table
-- This enables WhatsApp-style message replies

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID
    REFERENCES public.chat_messages(id) ON DELETE SET NULL;

-- Index to speed up lookups when fetching replied-to messages via JOIN
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to_id
  ON public.chat_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;
