-- Update vote milestone notifications to trigger at 5/10/20/50/100 upvotes.
-- Supports both INSERT (new vote) and UPDATE (downvote->upvote) events.
-- Prevents duplicate notifications for the same milestone per post by
-- checking existing notifications for the exact milestone message.

-- 1) Function: public.notify_upvote_milestone()
CREATE OR REPLACE FUNCTION public.notify_upvote_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  post_author_id uuid;
  current_vote_count integer;
  milestone_message text;
BEGIN
  -- Avoid re-processing updates that don't actually change the vote type.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.vote_type IS NOT DISTINCT FROM NEW.vote_type THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Only process upvotes.
  IF NEW.vote_type != 'upvote' THEN
    RETURN NEW;
  END IF;

  -- Sanity: this function should only run for post votes.
  IF NEW.post_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the post author. (SECURITY DEFINER bypasses RLS)
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  IF post_author_id IS NULL OR post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Count current upvotes for this post.
  SELECT COUNT(*) INTO current_vote_count
  FROM votes
  WHERE post_id = NEW.post_id
    AND vote_type = 'upvote';

  -- Only notify at specific milestones.
  IF current_vote_count NOT IN (5, 10, 20, 50, 100) THEN
    RETURN NEW;
  END IF;

  -- Respect user notification toggle.
  IF NOT EXISTS (
    SELECT 1
    FROM notification_settings
    WHERE user_id = post_author_id
      AND notify_upvotes = true
  ) THEN
    RETURN NEW;
  END IF;

  milestone_message :=
    'Your post received ' || current_vote_count::text || ' upvotes!';

  -- Prevent duplicate notifications for the same milestone per post.
  IF EXISTS (
    SELECT 1
    FROM notifications
    WHERE user_id = post_author_id
      AND type = 'upvote'
      AND related_post_id = NEW.post_id
      AND message = milestone_message
  ) THEN
    RETURN NEW;
  END IF;

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
    milestone_message,
    false
  );

  RETURN NEW;
END;
$function$;

-- 2) Trigger: public.trigger_notify_upvote_milestone
DROP TRIGGER IF EXISTS trigger_notify_upvote_milestone ON public.votes;

CREATE TRIGGER trigger_notify_upvote_milestone
  AFTER INSERT OR UPDATE OF vote_type
  ON public.votes
  FOR EACH ROW
  WHEN (NEW.post_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_upvote_milestone();

