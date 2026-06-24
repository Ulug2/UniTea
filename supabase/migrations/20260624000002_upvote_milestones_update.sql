-- Replace milestones with: 3, 5, 7, 10, 15, 20, 30, 40, 50, 100
-- Removes milestone=1 (testing artifact).
-- New milestones added: 3, 7, 15, 30, 40.

-- 1. Remove milestone=1 rows before tightening the constraint
DELETE FROM public.post_vote_milestones WHERE milestone = 1;

-- 2. Replace check constraint
ALTER TABLE public.post_vote_milestones
  DROP CONSTRAINT IF EXISTS post_vote_milestones_milestone_check;

ALTER TABLE public.post_vote_milestones
  ADD CONSTRAINT post_vote_milestones_milestone_check
  CHECK (milestone IN (3, 5, 7, 10, 15, 20, 30, 40, 50, 100));

-- 3. Rewrite trigger function
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

  IF v_upvote_count NOT IN (3, 5, 7, 10, 15, 20, 30, 40, 50, 100) THEN
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
    'Your post received ' ||
      CASE WHEN v_milestone = 100 THEN '100+' ELSE v_milestone::text END ||
      ' upvotes!',
    false
  );

  RETURN NEW;
END;
$$;

-- 4. Retroactive seed for newly added milestones (3, 7, 15, 30, 40).
--    5, 10, 20, 50, 100 were already seeded by the previous migration.
INSERT INTO post_vote_milestones (post_id, milestone, triggered_at)
SELECT
  p.id,
  m.milestone,
  COALESCE(
    (SELECT MIN(n.created_at)
     FROM notifications n
     WHERE n.related_post_id = p.id
       AND n.type = 'upvote'
       AND n.message = 'Your post received ' ||
           CASE WHEN m.milestone = 100 THEN '100+' ELSE m.milestone::text END ||
           ' upvotes!'),
    NOW()
  )
FROM posts p
CROSS JOIN (VALUES (3), (7), (15), (30), (40)) AS m(milestone)
WHERE (p.is_deleted = false OR p.is_deleted IS NULL)
  AND (
    SELECT COUNT(*)
    FROM votes v
    WHERE v.post_id = p.id
      AND v.vote_type = 'upvote'
  ) >= m.milestone
ON CONFLICT (post_id, milestone) DO NOTHING;
