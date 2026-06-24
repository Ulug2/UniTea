-- Add milestone=1 (first upvote) for push notification testing.
-- Includes correct singular/plural copy and retroactive seed.

-- 1. Widen the check constraint to allow milestone=1
ALTER TABLE public.post_vote_milestones
  DROP CONSTRAINT IF EXISTS post_vote_milestones_milestone_check;

ALTER TABLE public.post_vote_milestones
  ADD CONSTRAINT post_vote_milestones_milestone_check
  CHECK (milestone IN (1, 5, 10, 20, 50, 100));

-- 2. Rewrite trigger function with milestone=1 and singular message copy
CREATE OR REPLACE FUNCTION public.notify_upvote_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author_id  UUID;
  v_upvote_count    INTEGER;
  v_milestone       INTEGER;
  v_claimed         INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.vote_type IS NOT DISTINCT FROM NEW.vote_type THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.vote_type != 'upvote' THEN
    RETURN NEW;
  END IF;

  IF NEW.post_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  IF v_post_author_id IS NULL OR v_post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_upvote_count
  FROM votes
  WHERE post_id = NEW.post_id
    AND vote_type = 'upvote';

  IF v_upvote_count NOT IN (1, 5, 10, 20, 50, 100) THEN
    RETURN NEW;
  END IF;

  v_milestone := v_upvote_count;

  INSERT INTO post_vote_milestones (post_id, milestone)
  VALUES (NEW.post_id, v_milestone)
  ON CONFLICT (post_id, milestone) DO NOTHING;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  IF v_claimed = 0 THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM notification_settings
    WHERE user_id = v_post_author_id
      AND notify_upvotes = true
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
    v_post_author_id,
    'upvote',
    NEW.post_id,
    NEW.user_id,
    'Your post received ' || v_milestone::text ||
      CASE WHEN v_milestone = 1 THEN ' upvote!' ELSE ' upvotes!' END,
    false
  );

  RETURN NEW;
END;
$$;

-- 3. Seed milestone=1 for all posts that already have at least 1 upvote
--    so the new milestone doesn't re-fire for existing content.
INSERT INTO post_vote_milestones (post_id, milestone, triggered_at)
SELECT
  p.id,
  1,
  COALESCE(
    (SELECT MIN(n.created_at)
     FROM notifications n
     WHERE n.related_post_id = p.id
       AND n.type = 'upvote'
       AND n.message = 'Your post received 1 upvote!'),
    NOW()
  )
FROM posts p
WHERE (p.is_deleted = false OR p.is_deleted IS NULL)
  AND (
    SELECT COUNT(*)
    FROM votes v
    WHERE v.post_id = p.id
      AND v.vote_type = 'upvote'
  ) >= 1
ON CONFLICT (post_id, milestone) DO NOTHING;
