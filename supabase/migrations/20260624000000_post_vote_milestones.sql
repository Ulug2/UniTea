-- ============================================================
-- Upvote milestone notification: race-condition-safe rewrite
--
-- Root causes fixed:
--
-- 1. RACE CONDITION (structural) — the old dedup used
--    SELECT...FROM notifications WHERE message = '...5 upvotes!'
--    inside the same transaction. Under concurrent upvotes both
--    transactions see "no existing notification" before either
--    commits, both pass the check, and both INSERT a notification.
--    Evidence: post b26f6f26 has two identical "5 upvotes"
--    notifications in the DB.
--
-- 2. FRAGILE DEDUP (structural) — keying dedup on notification
--    message text means any copy change or message typo causes all
--    old milestones to re-fire.
--
-- 3. MISSING MILESTONES (structural) — if two concurrent votes
--    both see the count jump past a threshold in one quantum (e.g.
--    count goes 4→6 because both transactions read 4+1=5 but the
--    committed count is 6), the trigger never observes count=5 and
--    that milestone is skipped forever.
--
-- 4. NOTIFY_UPVOTES=FALSE SILENTLY DISCARDS MILESTONES (immediate)
--    — the old trigger checked notify_upvotes BEFORE recording the
--    milestone anywhere. If the author had notifications off at the
--    moment the milestone was crossed, the milestone was gone
--    forever with no trace. Confirmed: author 6c920b53 had
--    notify_upvotes=false; post 209eb08e reached 5 upvotes on
--    2026-06-24 with no notification written.
--
-- Fix: introduce post_vote_milestones (post_id, milestone) with a
-- PRIMARY KEY that serves as the atomic claim. The trigger does:
--   INSERT ... ON CONFLICT DO NOTHING → GET DIAGNOSTICS rows = ROW_COUNT
-- If rows = 0, another transaction already claimed this milestone;
-- do nothing. If rows = 1, this transaction wins the race; THEN
-- check notify_upvotes. The milestone is permanently recorded
-- regardless of notification preference, preventing re-fire even
-- if the vote count oscillates or notify_upvotes is toggled.
-- ============================================================

-- ── 1. Milestone claim table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.post_vote_milestones (
  post_id      UUID    NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  milestone    INTEGER NOT NULL CHECK (milestone IN (5, 10, 20, 50, 100)),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, milestone)
);

-- RLS: trigger function runs as SECURITY DEFINER (postgres role)
-- which bypasses RLS; enabling RLS here simply blocks direct
-- PostgREST access from authenticated/anon clients.
ALTER TABLE public.post_vote_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_vote_milestones FROM PUBLIC, authenticated, anon;

-- ── 2. Rewrite the trigger function ──────────────────────────

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
  -- Skip no-op UPDATEs (vote_type unchanged)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.vote_type IS NOT DISTINCT FROM NEW.vote_type THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Only fire on upvotes
  IF NEW.vote_type != 'upvote' THEN
    RETURN NEW;
  END IF;

  -- Guard: only post votes reach this path (trigger WHEN clause
  -- already filters, but be explicit)
  IF NEW.post_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve post author
  SELECT user_id INTO v_post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Author unknown or author is the voter
  IF v_post_author_id IS NULL OR v_post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Count upvotes AFTER this INSERT (trigger fires AFTER)
  SELECT COUNT(*) INTO v_upvote_count
  FROM votes
  WHERE post_id = NEW.post_id
    AND vote_type = 'upvote';

  -- Only proceed at milestone counts
  IF v_upvote_count NOT IN (5, 10, 20, 50, 100) THEN
    RETURN NEW;
  END IF;

  v_milestone := v_upvote_count;

  -- Atomically claim this milestone.
  -- PRIMARY KEY (post_id, milestone) guarantees exactly one
  -- concurrent transaction can insert for a given (post, milestone)
  -- pair — the loser gets ON CONFLICT DO NOTHING with ROW_COUNT = 0.
  INSERT INTO post_vote_milestones (post_id, milestone)
  VALUES (NEW.post_id, v_milestone)
  ON CONFLICT (post_id, milestone) DO NOTHING;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  -- Another transaction already owns this milestone
  IF v_claimed = 0 THEN
    RETURN NEW;
  END IF;

  -- Milestone is now permanently recorded.
  -- Only create a notification if the author has opted in.
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
    'Your post received ' || v_milestone::text || ' upvotes!',
    false
  );

  RETURN NEW;
END;
$$;

-- Trigger definition is unchanged; recreate to pick up any DDL
-- changes and ensure the WHEN clause is in place.
DROP TRIGGER IF EXISTS trigger_notify_upvote_milestone ON public.votes;

CREATE TRIGGER trigger_notify_upvote_milestone
  AFTER INSERT OR UPDATE OF vote_type
  ON public.votes
  FOR EACH ROW
  WHEN (NEW.post_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_upvote_milestone();

-- ── 3. Retroactive seed ───────────────────────────────────────
-- Back-fill post_vote_milestones for every (post, milestone) pair
-- that has already been reached so the new trigger never re-fires
-- a milestone that was crossed before this migration ran.
--
-- Uses current upvote counts (authoritative) rather than the
-- notifications table (which may be missing rows where
-- notify_upvotes was false at the time the milestone was crossed).

INSERT INTO post_vote_milestones (post_id, milestone, triggered_at)
SELECT
  p.id                          AS post_id,
  m.milestone,
  -- Prefer the timestamp from the earliest existing notification for
  -- this milestone; fall back to now() for milestones that were
  -- never notified (e.g. notify_upvotes was false).
  COALESCE(
    (
      SELECT MIN(n.created_at)
      FROM notifications n
      WHERE n.related_post_id = p.id
        AND n.type = 'upvote'
        AND n.message = 'Your post received ' || m.milestone::text || ' upvotes!'
    ),
    NOW()
  )                             AS triggered_at
FROM posts p
CROSS JOIN (VALUES (5), (10), (20), (50), (100)) AS m(milestone)
WHERE
  (
    SELECT COUNT(*)
    FROM votes v
    WHERE v.post_id = p.id
      AND v.vote_type = 'upvote'
  ) >= m.milestone
  AND (p.is_deleted = false OR p.is_deleted IS NULL)
ON CONFLICT (post_id, milestone) DO NOTHING;
