-- Backfill daily_stats_snapshots for all historical dates.
--
-- Root cause: compute_daily_stats() exists since 20260620200000, but no cron
-- job was ever scheduled and no manual backfill was performed, leaving
-- daily_stats_snapshots empty. The dashboard bar chart and content-period
-- filters all rely on this table.
--
-- This migration inlines the same aggregation logic as compute_daily_stats()
-- to avoid the SECURITY DEFINER call restriction in migration context.
--
-- DAU columns will be 0 for historical dates because user_activity_events was
-- also empty (activityLogger.ts bug fixed in the same deployment batch).
-- Content counts (posts/comments/communities) are accurate from day one.

DO $$
DECLARE
  v_date       date;
  v_first_date date;

  -- platform-wide aggregates for each target date
  v_dau_basic         int;
  v_dau_engaged       int;
  v_dau_action        int;
  v_posts             int;
  v_comments          int;
  v_communities       int;
BEGIN
  -- Earliest date on which any non-deleted content exists
  SELECT MIN(d)::date INTO v_first_date
  FROM (
    SELECT MIN(created_at) AS d
      FROM posts
     WHERE (is_deleted IS NULL OR is_deleted = false)
    UNION ALL
    SELECT MIN(created_at)
      FROM comments
     WHERE (is_deleted IS NULL OR is_deleted = false)
    UNION ALL
    SELECT MIN(created_at)
      FROM communities
  ) sub;

  IF v_first_date IS NULL THEN
    RAISE NOTICE 'backfill: no content found — skipping.';
    RETURN;
  END IF;

  v_date := v_first_date;
  WHILE v_date < CURRENT_DATE LOOP

    -- DAU tiers from activity events (0 for dates before event logging was fixed)
    SELECT COUNT(DISTINCT user_id) INTO v_dau_basic
      FROM user_activity_events
     WHERE event_type = 'session_start'
       AND occurred_at::date = v_date;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_engaged
      FROM user_activity_events
     WHERE event_type = 'engaged_session'
       AND occurred_at::date = v_date;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_action
      FROM user_activity_events
     WHERE event_type IN ('post_created', 'comment_created', 'community_created')
       AND occurred_at::date = v_date;

    -- Content counts from source tables
    SELECT COUNT(*) INTO v_posts
      FROM posts
     WHERE created_at::date = v_date
       AND (is_deleted IS NULL OR is_deleted = false);

    SELECT COUNT(*) INTO v_comments
      FROM comments
     WHERE created_at::date = v_date
       AND (is_deleted IS NULL OR is_deleted = false);

    SELECT COUNT(*) INTO v_communities
      FROM communities
     WHERE created_at::date = v_date;

    INSERT INTO daily_stats_snapshots
      (snapshot_date, university_id,
       dau_basic, dau_engaged, dau_action,
       posts_created, comments_created, communities_created)
    VALUES
      (v_date, NULL,
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

    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  RAISE NOTICE 'backfill: wrote platform-wide snapshots from % through %',
    v_first_date, CURRENT_DATE - 1;
END;
$$;

-- ── Schedule nightly cron job ────────────────────────────────────────────────
--
-- Runs at 05:05 UTC (≈ 00:05 ET) daily, aggregating the previous calendar day.
-- Requires pg_cron: Dashboard → Database → Extensions → pg_cron → Enable.
--
-- If pg_cron is not yet enabled, the DO block below exits silently.
-- Run these two statements manually in the SQL editor after enabling pg_cron:
--
--   SELECT cron.unschedule('compute-daily-stats');
--   SELECT cron.schedule(
--     'compute-daily-stats',
--     '5 5 * * *',
--     $cmd$SELECT public.compute_daily_stats((CURRENT_DATE - INTERVAL '1 day')::date)$cmd$
--   );

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('compute-daily-stats');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.schedule(
    'compute-daily-stats',
    '5 5 * * *',
    $cmd$SELECT public.compute_daily_stats((CURRENT_DATE - INTERVAL '1 day')::date)$cmd$
  );
  RAISE NOTICE 'cron: scheduled compute-daily-stats at 05:05 UTC daily.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron: pg_cron not available — schedule the job manually (see comment above).';
END;
$$;
