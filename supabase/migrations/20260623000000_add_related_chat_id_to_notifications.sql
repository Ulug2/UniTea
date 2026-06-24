-- ============================================================
-- Store chat_id directly in notifications for reliable routing.
--
-- The notify_chat_message trigger previously omitted related_chat_id
-- from notifications because the column didn't exist.  The edge
-- function then had to resolve the chat via user_chats_summary,
-- which could fail when two users have multiple chats (the
-- .maybeSingle() call errors on >1 row), leaving relatedChatId
-- null in the push payload and routing the notification tap to
-- the generic /chat screen.
--
-- Fix: add related_chat_id to notifications; recreate
-- notify_chat_message() to populate it with NEW.chat_id.
-- ============================================================

-- 1. Add column
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_chat_id UUID
    REFERENCES public.chats(id) ON DELETE SET NULL;

-- 2. Recreate notify_chat_message to populate related_chat_id
CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_id    uuid;
  sender_id       uuid;
  notify_enabled  boolean;
  recent_count    integer;
  msg_content     text;
BEGIN
  sender_id := NEW.user_id;

  -- Determine recipient from the chat record
  SELECT
    CASE
      WHEN participant_1_id = sender_id THEN participant_2_id
      ELSE participant_1_id
    END
  INTO recipient_id
  FROM chats
  WHERE id = NEW.chat_id;

  IF recipient_id IS NULL OR recipient_id = sender_id THEN
    RETURN NEW;
  END IF;

  -- Respect the recipient's notification preference
  SELECT notify_chats INTO notify_enabled
  FROM notification_settings
  WHERE user_id = recipient_id;

  IF notify_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Dedup: check for any notification from this sender in the last minute
  SELECT COUNT(*) INTO recent_count
  FROM notifications
  WHERE user_id = recipient_id
    AND type = 'chat_message'
    AND related_user_id = sender_id
    AND created_at > NOW() - INTERVAL '1 minute';

  -- Mark previous unsent notifications from this sender as sent so
  -- the edge function does not re-process them as a stale batch.
  UPDATE notifications
  SET push_sent = true
  WHERE user_id = recipient_id
    AND type = 'chat_message'
    AND related_user_id = sender_id
    AND (push_sent IS NULL OR push_sent = false);

  -- Suppress new notification when already notified within the dedup window
  IF recent_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Build message preview
  IF NEW.content IS NOT NULL AND NEW.content <> '' THEN
    msg_content := NEW.content;
  ELSIF NEW.image_url IS NOT NULL AND NEW.image_url <> '' THEN
    msg_content := 'Sent a photo';
  ELSE
    msg_content := 'Sent a message';
  END IF;

  INSERT INTO notifications (
    user_id,
    type,
    related_user_id,
    related_chat_id,
    message,
    is_read,
    push_sent
  ) VALUES (
    recipient_id,
    'chat_message',
    sender_id,
    NEW.chat_id,
    msg_content,
    false,
    false
  );

  RETURN NEW;
END;
$$;

-- Trigger fires via DML; revoke direct EXECUTE from all roles.
REVOKE EXECUTE ON FUNCTION public.notify_chat_message() FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_chat_message() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Re-create the trigger on chat_messages if it doesn't already exist.
-- (The trigger was originally created via the Supabase dashboard;
--  this ensures it survives schema resets.)
DROP TRIGGER IF EXISTS trigger_notify_chat_message ON public.chat_messages;
CREATE TRIGGER trigger_notify_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message();
