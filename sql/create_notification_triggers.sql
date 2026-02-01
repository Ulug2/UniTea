-- Create notification triggers for chat messages, votes, and trending posts

-- First, update notifications table to allow 'trending' type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type = ANY (ARRAY['comment_reply'::text, 'upvote'::text, 'chat_message'::text, 'trending'::text]));

-- 1. Trigger for chat messages: Create notification when a new message is received
CREATE OR REPLACE FUNCTION notify_chat_message()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id uuid;
  chat_record record;
  sender_username text;
BEGIN
  -- Get chat to find recipient
  SELECT participant_1_id, participant_2_id INTO chat_record
  FROM chats
  WHERE id = NEW.chat_id;

  -- Determine recipient (the other participant)
  IF chat_record.participant_1_id = NEW.user_id THEN
    recipient_id := chat_record.participant_2_id;
  ELSE
    recipient_id := chat_record.participant_1_id;
  END IF;

  -- Skip if recipient is anonymous or sender is recipient
  IF recipient_id IS NULL OR recipient_id::text LIKE 'anonymous-%' OR recipient_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Check if recipient has notify_chats enabled
  IF EXISTS (
    SELECT 1 FROM notification_settings
    WHERE user_id = recipient_id
    AND notify_chats = true
  ) THEN
    -- Get sender username for notification message
    SELECT username INTO sender_username
    FROM profiles
    WHERE id = NEW.user_id;

    -- Create notification
    INSERT INTO notifications (
      user_id,
      type,
      related_user_id,
      message,
      is_read
    ) VALUES (
      recipient_id,
      'chat_message',
      NEW.user_id,
      COALESCE(sender_username || ' sent you a message', 'You received a new message'),
      false
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_notify_chat_message ON chat_messages;
CREATE TRIGGER trigger_notify_chat_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_chat_message();

-- 2. Trigger for votes: Create notification when post reaches 5 upvotes
CREATE OR REPLACE FUNCTION notify_upvote_milestone()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id uuid;
  current_vote_count integer;
BEGIN
  -- Only process upvotes
  IF NEW.vote_type != 'upvote' THEN
    RETURN NEW;
  END IF;

  -- Skip if voting on own post
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  IF post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Count current upvotes for this post
  SELECT COUNT(*) INTO current_vote_count
  FROM votes
  WHERE post_id = NEW.post_id
  AND vote_type = 'upvote';

  -- Only notify when reaching exactly 5 upvotes (to avoid duplicate notifications)
  IF current_vote_count = 5 THEN
    -- Check if post author has notify_upvotes enabled
    IF EXISTS (
      SELECT 1 FROM notification_settings
      WHERE user_id = post_author_id
      AND notify_upvotes = true
    ) THEN
      -- Create notification
      INSERT INTO notifications (
        user_id,
        type,
        related_post_id,
        related_user_id,
        message,
        is_read
      ) VALUES (
        post_author_id,
        'upvote',
        NEW.post_id,
        NEW.user_id,
        'Your post received 5 upvotes!',
        false
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_notify_upvote_milestone ON votes;
CREATE TRIGGER trigger_notify_upvote_milestone
  AFTER INSERT ON votes
  FOR EACH ROW
  WHEN (NEW.post_id IS NOT NULL)
  EXECUTE FUNCTION notify_upvote_milestone();

-- 3. Trigger for trending posts: Check engagement and notify post author
CREATE OR REPLACE FUNCTION notify_trending_post()
RETURNS TRIGGER AS $$
DECLARE
  engagement_score integer;
  post_author_id uuid;
BEGIN
  -- Calculate engagement score: votes + comments + reposts
  SELECT 
    COALESCE((
      SELECT COUNT(*) FROM votes WHERE post_id = NEW.id AND vote_type = 'upvote'
    ), 0) +
    COALESCE((
      SELECT COUNT(*) FROM comments WHERE post_id = NEW.id
    ), 0) +
    COALESCE((
      SELECT COUNT(*) FROM posts WHERE reposted_from_post_id = NEW.id
    ), 0)
  INTO engagement_score;

  -- Consider a post "trending" if it has 20+ engagement within 24 hours
  IF engagement_score >= 20 AND NEW.created_at > NOW() - INTERVAL '24 hours' THEN
    post_author_id := NEW.user_id;

    -- Check if post author has notify_trending enabled
    IF EXISTS (
      SELECT 1 FROM notification_settings
      WHERE user_id = post_author_id
      AND notify_trending = true
    ) THEN
      -- Check if notification already exists (avoid duplicates)
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE user_id = post_author_id
        AND type = 'trending'
        AND related_post_id = NEW.id
      ) THEN
        -- Create notification
        INSERT INTO notifications (
          user_id,
          type,
          related_post_id,
          message,
          is_read
        ) VALUES (
          post_author_id,
          'trending',
          NEW.id,
          'Your post is trending!',
          false
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
-- Note: This trigger runs on UPDATE to check engagement after votes/comments are added
DROP TRIGGER IF EXISTS trigger_notify_trending_post ON posts;
CREATE TRIGGER trigger_notify_trending_post
  AFTER UPDATE ON posts
  FOR EACH ROW
  WHEN (OLD.updated_at IS DISTINCT FROM NEW.updated_at)
  EXECUTE FUNCTION notify_trending_post();

-- Also create trigger for when comments/votes are added (via function call)
-- This is handled by updating the post's updated_at timestamp
-- when comments or votes are added (via separate triggers or application logic)

-- Helper function to update post updated_at when engagement changes
-- Runs on: comments (NEW.post_id) and votes (NEW.post_id, only when post_id IS NOT NULL via WHEN clause)
CREATE OR REPLACE FUNCTION update_post_engagement_timestamp()
RETURNS TRIGGER AS $$
DECLARE
  target_post_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'comments' THEN
    target_post_id := NEW.post_id;
  ELSIF TG_TABLE_NAME = 'votes' AND NEW.post_id IS NOT NULL THEN
    target_post_id := NEW.post_id;
  ELSE
    RETURN NEW;
  END IF;

  IF target_post_id IS NOT NULL THEN
    UPDATE posts
    SET updated_at = NOW()
    WHERE id = target_post_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on votes to update post timestamp
DROP TRIGGER IF EXISTS trigger_update_post_on_vote ON votes;
CREATE TRIGGER trigger_update_post_on_vote
  AFTER INSERT OR UPDATE ON votes
  FOR EACH ROW
  WHEN (NEW.post_id IS NOT NULL)
  EXECUTE FUNCTION update_post_engagement_timestamp();

-- Trigger on comments to update post timestamp
DROP TRIGGER IF EXISTS trigger_update_post_on_comment ON comments;
CREATE TRIGGER trigger_update_post_on_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_post_engagement_timestamp();
