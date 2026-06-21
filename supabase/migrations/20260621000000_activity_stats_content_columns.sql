-- Adds comments_created and communities_created to daily_stats_snapshots,
-- then replaces compute_daily_stats to populate them.
-- Run this if you already applied 20260620200000_activity_stats.sql.

-- ── 1. New columns ───────────────────────────────────────────────────────────

ALTER TABLE public.daily_stats_snapshots
  ADD COLUMN IF NOT EXISTS comments_created    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS communities_created int NOT NULL DEFAULT 0;

-- ── 2. Updated aggregation function ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_daily_stats(target_date date)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_university_id     uuid;
  v_dau_basic         int;
  v_dau_engaged       int;
  v_dau_action        int;
  v_posts             int;
  v_comments          int;
  v_communities       int;
  v_count             int := 0;
BEGIN
  -- ── Platform-wide (NULL university_id) ──────────────────────────────────

  SELECT COUNT(DISTINCT user_id) INTO v_dau_basic
  FROM user_activity_events
  WHERE event_type = 'session_start' AND occurred_at::date = target_date;

  SELECT COUNT(DISTINCT user_id) INTO v_dau_engaged
  FROM user_activity_events
  WHERE event_type = 'engaged_session' AND occurred_at::date = target_date;

  SELECT COUNT(DISTINCT user_id) INTO v_dau_action
  FROM user_activity_events
  WHERE event_type IN ('post_created', 'comment_created', 'community_created')
    AND occurred_at::date = target_date;

  SELECT COUNT(*) INTO v_posts
  FROM posts
  WHERE created_at::date = target_date
    AND (is_deleted IS NULL OR is_deleted = false);

  SELECT COUNT(*) INTO v_comments
  FROM comments
  WHERE created_at::date = target_date
    AND (is_deleted IS NULL OR is_deleted = false);

  SELECT COUNT(*) INTO v_communities
  FROM communities
  WHERE created_at::date = target_date;

  INSERT INTO daily_stats_snapshots
    (snapshot_date, university_id,
     dau_basic, dau_engaged, dau_action,
     posts_created, comments_created, communities_created)
  VALUES
    (target_date, NULL,
     v_dau_basic, v_dau_engaged, v_dau_action,
     v_posts, v_comments, v_communities)
  ON CONFLICT (snapshot_date) WHERE university_id IS NULL
  DO UPDATE SET
    dau_basic           = EXCLUDED.dau_basic,
    dau_engaged         = EXCLUDED.dau_engaged,
    dau_action          = EXCLUDED.dau_action,
    posts_created       = EXCLUDED.posts_created,
    comments_created    = EXCLUDED.comments_created,
    communities_created = EXCLUDED.communities_created,
    computed_at         = now();

  v_count := 1;

  -- ── Per-university ───────────────────────────────────────────────────────

  FOR v_university_id IN SELECT id FROM universities
  LOOP
    SELECT COUNT(DISTINCT user_id) INTO v_dau_basic
    FROM user_activity_events
    WHERE event_type = 'session_start'
      AND occurred_at::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_engaged
    FROM user_activity_events
    WHERE event_type = 'engaged_session'
      AND occurred_at::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_action
    FROM user_activity_events
    WHERE event_type IN ('post_created', 'comment_created', 'community_created')
      AND occurred_at::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(*) INTO v_posts
    FROM posts
    WHERE created_at::date = target_date
      AND (is_deleted IS NULL OR is_deleted = false)
      AND university_id = v_university_id;

    -- comments has no university_id; join through posts to scope by university
    SELECT COUNT(*) INTO v_comments
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    WHERE c.created_at::date = target_date
      AND (c.is_deleted IS NULL OR c.is_deleted = false)
      AND p.university_id = v_university_id;

    SELECT COUNT(*) INTO v_communities
    FROM communities
    WHERE created_at::date = target_date
      AND university_id = v_university_id;

    INSERT INTO daily_stats_snapshots
      (snapshot_date, university_id,
       dau_basic, dau_engaged, dau_action,
       posts_created, comments_created, communities_created)
    VALUES
      (target_date, v_university_id,
       v_dau_basic, v_dau_engaged, v_dau_action,
       v_posts, v_comments, v_communities)
    ON CONFLICT (snapshot_date, university_id) WHERE university_id IS NOT NULL
    DO UPDATE SET
      dau_basic           = EXCLUDED.dau_basic,
      dau_engaged         = EXCLUDED.dau_engaged,
      dau_action          = EXCLUDED.dau_action,
      posts_created       = EXCLUDED.posts_created,
      comments_created    = EXCLUDED.comments_created,
      communities_created = EXCLUDED.communities_created,
      computed_at         = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('computed_date', target_date, 'rows_written', v_count);
END;
$$;
