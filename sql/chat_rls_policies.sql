-- RLS Policies for Chat System
-- Run these in your Supabase SQL Editor

-- Enable RLS on chats table (if not already enabled)
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Enable RLS on chat_messages table (if not already enabled)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CHATS TABLE POLICIES
-- ============================================

-- Allow users to SELECT chats where they are a participant
CREATE POLICY "Users can view chats they participate in"
ON public.chats
FOR SELECT
USING (
  auth.uid() = participant_1_id OR 
  auth.uid() = participant_2_id
);

-- Allow users to INSERT chats where they are participant_1_id or participant_2_id
CREATE POLICY "Users can create chats they participate in"
ON public.chats
FOR INSERT
WITH CHECK (
  auth.uid() = participant_1_id OR 
  auth.uid() = participant_2_id
);

-- Allow users to UPDATE chats where they are a participant
CREATE POLICY "Users can update chats they participate in"
ON public.chats
FOR UPDATE
USING (
  auth.uid() = participant_1_id OR 
  auth.uid() = participant_2_id
)
WITH CHECK (
  auth.uid() = participant_1_id OR 
  auth.uid() = participant_2_id
);

-- Allow users to DELETE chats where they are a participant
CREATE POLICY "Users can delete chats they participate in"
ON public.chats
FOR DELETE
USING (
  auth.uid() = participant_1_id OR 
  auth.uid() = participant_2_id
);

-- ============================================
-- CHAT_MESSAGES TABLE POLICIES
-- ============================================

-- Allow users to SELECT messages from chats they participate in
CREATE POLICY "Users can view messages from their chats"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chats
    WHERE chats.id = chat_messages.chat_id
    AND (
      chats.participant_1_id = auth.uid() OR 
      chats.participant_2_id = auth.uid()
    )
  )
);

-- Allow users to INSERT messages into chats they participate in
CREATE POLICY "Users can send messages to chats they participate in"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.chats
    WHERE chats.id = chat_messages.chat_id
    AND (
      chats.participant_1_id = auth.uid() OR 
      chats.participant_2_id = auth.uid()
    )
  )
);

-- Allow users to UPDATE messages they sent OR messages in chats they participate in
-- (for marking as read, soft delete flags, etc.)
CREATE POLICY "Users can update messages in their chats"
ON public.chat_messages
FOR UPDATE
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.chats
    WHERE chats.id = chat_messages.chat_id
    AND (
      chats.participant_1_id = auth.uid() OR 
      chats.participant_2_id = auth.uid()
    )
  )
)
WITH CHECK (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.chats
    WHERE chats.id = chat_messages.chat_id
    AND (
      chats.participant_1_id = auth.uid() OR 
      chats.participant_2_id = auth.uid()
    )
  )
);

-- Allow users to DELETE messages from chats they participate in
CREATE POLICY "Users can delete messages from their chats"
ON public.chat_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.chats
    WHERE chats.id = chat_messages.chat_id
    AND (
      chats.participant_1_id = auth.uid() OR 
      chats.participant_2_id = auth.uid()
    )
  )
);
