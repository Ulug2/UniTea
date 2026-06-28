-- Medium-priority security fixes 2026-06-28
--
-- M2: Rate-limit INSERT on user_activity_events to prevent DAU inflation via
--     direct API calls (edge functions rate-limit post/comment/community already;
--     session_start and engaged_session were unguarded).
-- M3: Move anonymous comment ID assignment to a BEFORE INSERT trigger so the
--     SELECT→decide→INSERT sequence is atomic (row-level lock on the post).
-- M5: Fix notify_chat_message to never store the real sender identity in
--     related_user_id when the chat is anonymous.  Use related_chat_id for
--     dedup instead of related_user_id so the field can safely be NULL.

-- ── M2: Rate-limit user_activity_events inserts ───────────────────────────

CREATE OR REPLACE FUNCTION public.rate_limit_activity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 20 events per user per 10 minutes across all event types.
  -- Allows normal bursts (login + post + comment in one session) while
  -- blocking DAU-inflation floods via the PostgREST API.
  IF NOT check_rate_limit(
    'activity_event:' || auth.uid()::text,
    20,
    600
  ) THEN
    RAISE EXCEPTION 'rate limit exceeded for activity events';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_activity_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rate_limit_activity_event ON public.user_activity_events;
CREATE TRIGGER trg_rate_limit_activity_event
  BEFORE INSERT ON public.user_activity_events
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_activity_event();

-- ── M3: Atomic anonymous comment ID assignment ────────────────────────────
--
-- The edge function previously did SELECT max→INSERT as two separate queries,
-- allowing two concurrent anonymous comments to both read max=N and both be
-- assigned ID N+1.  Moving the logic here lets us take a row-level lock on
-- the parent post before reading the max, serialising all concurrent anon
-- comments for the same post.

CREATE OR REPLACE FUNCTION public.assign_comment_anon_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anon_id integer;
BEGIN
  IF NEW.is_anonymous IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Lock the post row so concurrent anon comments on the same post are serialised.
  PERFORM id FROM public.posts WHERE id = NEW.post_id FOR UPDATE;

  -- Re-use the same anon ID if this user already has one for this post.
  SELECT post_specific_anon_id INTO v_anon_id
  FROM public.comments
  WHERE post_id = NEW.post_id
    AND user_id = NEW.user_id
    AND is_anonymous = true
    AND post_specific_anon_id IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_anon_id IS NULL THEN
    SELECT COALESCE(MAX(post_specific_anon_id), 0) + 1 INTO v_anon_id
    FROM public.comments
    WHERE post_id = NEW.post_id
      AND is_anonymous = true;
  END IF;

  NEW.post_specific_anon_id := v_anon_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_comment_anon_id() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_assign_comment_anon_id ON public.comments;
CREATE TRIGGER trg_assign_comment_anon_id
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_comment_anon_id();

-- ── M5: Fix notify_chat_message — no real sender identity for anon chats ──
--
-- Previous version stored related_user_id = sender_id regardless of
-- is_anonymous, then relied on send-push-notification to null it out after
-- the fact (race window).  This version:
--   • uses related_chat_id for deduplication (always available)
--   • sets related_user_id = NULL immediately for anonymous chats
--
-- send-push-notification is updated separately to use related_chat_id for
-- context resolution when related_user_id is null.

CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS TRIGGER
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
  chat_is_anon    boolean;
BEGIN
  sender_id := NEW.user_id;

  -- Determine recipient and whether the chat is anonymous
  SELECT
    CASE
      WHEN participant_1_id = sender_id THEN participant_2_id
      ELSE participant_1_id
    END,
    is_anonymous
  INTO recipient_id, chat_is_anon
  FROM chats
  WHERE id = NEW.chat_id;

  IF recipient_id IS NULL OR recipient_id = sender_id THEN
    RETURN NEW;
  END IF;

  SELECT notify_chats INTO notify_enabled
  FROM notification_settings
  WHERE user_id = recipient_id;

  IF notify_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Dedup on related_chat_id (works for both anon and non-anon chats)
  SELECT COUNT(*) INTO recent_count
  FROM notifications
  WHERE user_id = recipient_id
    AND type = 'chat_message'
    AND related_chat_id = NEW.chat_id
    AND created_at > NOW() - INTERVAL '1 minute';

  UPDATE notifications
  SET push_sent = true
  WHERE user_id = recipient_id
    AND type = 'chat_message'
    AND related_chat_id = NEW.chat_id
    AND (push_sent IS NULL OR push_sent = false);

  IF recent_count > 0 THEN
    RETURN NEW;
  END IF;

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
    CASE WHEN chat_is_anon THEN NULL ELSE sender_id END,
    NEW.chat_id,
    msg_content,
    false,
    false
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_chat_message() FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_chat_message() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DROP TRIGGER IF EXISTS trigger_notify_chat_message ON public.chat_messages;
CREATE TRIGGER trigger_notify_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message();
