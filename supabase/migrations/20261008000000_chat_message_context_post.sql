BEGIN;

-- ============================================================
-- Chat messages: the post a message was sent about
-- ============================================================
--
-- When someone opens a chat from a post (feed, Lost & Found, Market) the
-- first message they send carries that post's id, so both sides see which
-- post the conversation is about. It lives on the message, not the chat,
-- because a non-anonymous chat is one conversation per pair of users and
-- can be reopened from many different posts over time.
--
-- Purely additive, so installed app builds keep working unchanged: the
-- column is nullable with no default, older builds never send it and
-- ignore it when reading.
--
-- Deliberately not a foreign key: posts are hard-deleted, and a message
-- about a post that is later deleted should keep saying so ("Post
-- unavailable") rather than silently lose its context. The app resolves
-- the id through posts_summary_view under the reader's own RLS, so an id
-- the reader cannot see (deleted, other university, made up) reveals
-- nothing.
-- ============================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS context_post_id uuid;

-- Recreated from 20260925000000_chat_messages_multi_image.sql unchanged
-- except: context_post_id appended as the LAST column (CREATE OR REPLACE
-- VIEW can only add columns at the end).
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
      'image_urls', rm.image_urls,
      'user_id', CASE
        WHEN c.is_anonymous AND rm.user_id <> auth.uid() THEN NULL
        ELSE rm.user_id
      END,
      'deleted_by_sender', rm.deleted_by_sender,
      'deleted_by_receiver', rm.deleted_by_receiver
    )
  END AS reply_message,
  cm.image_urls,
  cm.context_post_id
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

-- Recreated from 20260925000000_chat_messages_multi_image.sql unchanged
-- except 'context_post_id' in the anonymous new_message payload.
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
      'image_urls', NEW.image_urls,
      'image_aspect_ratio', NEW.image_aspect_ratio,
      'created_at', NEW.created_at,
      'is_read', NEW.is_read,
      'reply_to_id', NEW.reply_to_id,
      'context_post_id', NEW.context_post_id
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

-- Same grants as after 20260817020000 (trigger-only; no anon/PUBLIC EXECUTE).
REVOKE ALL ON FUNCTION public.broadcast_anonymous_chat_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_anonymous_chat_message() FROM anon;

COMMIT;
