-- Analytics v3: Eastern Time anchoring, event-based content counts.
--
-- Problems fixed vs. v2:
--   1. Time zone: UTC midnight → Eastern Time (America/New_York, DST-aware).
--   2. WAU/MAU periods: included today → exclude today, cover only completed days.
--   3. App Opens: COUNT(*) raw events → COUNT(DISTINCT user_id) unique users.
--   4. Content counts: live tables with is_deleted filter (mutable) →
--      user_activity_events (immutable; unaffected by later deletions).
--   5. Bar chart: Y-axis posts → DAU. Data source: snapshots + live today.
--
-- Functions added / replaced:
--   get_analytics_summary()       — new; replaces get_event_counts_period calls
--   get_daily_stats_chart(p_days) — new; replaces get_daily_content_counts calls
--   compute_daily_stats(date)     — updated; ET boundary + event-based content
--
-- Old RPCs (get_event_counts_period, get_daily_content_counts) are left in the
-- DB; they are simply no longer called by the dashboard.


-- ── 1. get_analytics_summary ─────────────────────────────────────────────────
--
-- Returns exactly one row with all 12 cells of the 4×3 summary table.
--
-- Periods (all Eastern Time, DST-aware via America/New_York):
--   DAU: today midnight ET → now            (current partial day, live)
--   WAU: today midnight ET − 7 days → today midnight ET  (7 completed days)
--   MAU: today midnight ET − 30 days → today midnight ET (30 completed days)
--
-- App Opens = COUNT(DISTINCT user_id) on session_start events.
--   A user opening the app 5× in one day counts as 1 for that day.
--   WAU/MAU counts distinct users across the whole window (not sum of daily DAUs).
--
-- Content rows = COUNT(*) on the respective event types.
--   Events are written once at creation and never deleted when content is removed,
--   so these counts are permanently immutable.
--
-- Single bounded scan: outer WHERE limits to the last 30 days via the
-- idx_activity_events_occurred_at index; per-period filters run inside aggregates.

CREATE OR REPLACE FUNCTION public.get_analytics_summary()
RETURNS TABLE (
  dau_app_opens    bigint,
  dau_posts        bigint,
  dau_comments     bigint,
  dau_communities  bigint,
  wau_app_opens    bigint,
  wau_posts        bigint,
  wau_comments     bigint,
  wau_communities  bigint,
  mau_app_opens    bigint,
  mau_posts        bigint,
  mau_comments     bigint,
  mau_communities  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start timestamptz;
  v_wau_start   timestamptz;
  v_mau_start   timestamptz;
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Midnight of today in Eastern Time, expressed as UTC for comparison with occurred_at.
  -- AT TIME ZONE 'America/New_York' applied twice: first converts now() to ET to truncate,
  -- then converts the ET midnight back to UTC (a timestamptz, DST-aware).
  v_today_start := date_trunc('day', now() AT TIME ZONE 'America/New_York')
                     AT TIME ZONE 'America/New_York';
  v_wau_start   := v_today_start - INTERVAL '7 days';
  v_mau_start   := v_today_start - INTERVAL '30 days';

  RETURN QUERY
  SELECT
    -- DAU: today in ET
    COUNT(DISTINCT CASE WHEN event_type = 'session_start'
                         AND occurred_at >= v_today_start
                        THEN user_id END),
    COUNT(*) FILTER (WHERE event_type = 'post_created'      AND occurred_at >= v_today_start),
    COUNT(*) FILTER (WHERE event_type = 'comment_created'   AND occurred_at >= v_today_start),
    COUNT(*) FILTER (WHERE event_type = 'community_created' AND occurred_at >= v_today_start),

    -- WAU: previous 7 completed ET days, today excluded
    COUNT(DISTINCT CASE WHEN event_type = 'session_start'
                         AND occurred_at >= v_wau_start
                         AND occurred_at <  v_today_start
                        THEN user_id END),
    COUNT(*) FILTER (WHERE event_type = 'post_created'      AND occurred_at >= v_wau_start AND occurred_at < v_today_start),
    COUNT(*) FILTER (WHERE event_type = 'comment_created'   AND occurred_at >= v_wau_start AND occurred_at < v_today_start),
    COUNT(*) FILTER (WHERE event_type = 'community_created' AND occurred_at >= v_wau_start AND occurred_at < v_today_start),

    -- MAU: previous 30 completed ET days, today excluded
    COUNT(DISTINCT CASE WHEN event_type = 'session_start'
                         AND occurred_at >= v_mau_start
                         AND occurred_at <  v_today_start
                        THEN user_id END),
    COUNT(*) FILTER (WHERE event_type = 'post_created'      AND occurred_at >= v_mau_start AND occurred_at < v_today_start),
    COUNT(*) FILTER (WHERE event_type = 'comment_created'   AND occurred_at >= v_mau_start AND occurred_at < v_today_start),
    COUNT(*) FILTER (WHERE event_type = 'community_created' AND occurred_at >= v_mau_start AND occurred_at < v_today_start)

  FROM user_activity_events
  WHERE occurred_at >= v_mau_start; -- bound the scan to last 30 days
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_analytics_summary() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_analytics_summary() TO authenticated;


-- ── 2. get_daily_stats_chart ──────────────────────────────────────────────────
--
-- Returns one row per ET calendar day for the last p_days days.
-- Used by the bar chart; Y-axis is dau (unique users); tooltip shows all four.
--
-- Completed days (yesterday and older):
--   Read from daily_stats_snapshots — pre-aggregated by the nightly cron,
--   O(p_days) row reads, no live COUNT needed.
--
-- Today:
--   Live COUNT from user_activity_events anchored to ET midnight.
--   This row updates throughout the day and matches the DAU column in the table.
--
-- Ordered newest-first to match the dashboard's paginated display (offset * 7).

CREATE OR REPLACE FUNCTION public.get_daily_stats_chart(p_days int DEFAULT 90)
RETURNS TABLE (
  et_date     date,
  dau         bigint,
  posts       bigint,
  comments    bigint,
  communities bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_et    date;
  v_today_start timestamptz;
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_today_et    := (now() AT TIME ZONE 'America/New_York')::date;
  v_today_start := date_trunc('day', now() AT TIME ZONE 'America/New_York')
                     AT TIME ZONE 'America/New_York';

  RETURN QUERY

  -- Completed days: snapshots (platform-wide rows have university_id IS NULL)
  SELECT
    s.snapshot_date,
    s.dau_basic::bigint,
    s.posts_created::bigint,
    s.comments_created::bigint,
    s.communities_created::bigint
  FROM daily_stats_snapshots s
  WHERE s.university_id IS NULL
    AND s.snapshot_date >= v_today_et - (p_days - 1)
    AND s.snapshot_date <  v_today_et

  UNION ALL

  -- Today: live event counts, ET-anchored
  SELECT
    v_today_et,
    COUNT(DISTINCT CASE WHEN event_type = 'session_start' THEN user_id END)::bigint,
    COUNT(*) FILTER (WHERE event_type = 'post_created')::bigint,
    COUNT(*) FILTER (WHERE event_type = 'comment_created')::bigint,
    COUNT(*) FILTER (WHERE event_type = 'community_created')::bigint
  FROM user_activity_events
  WHERE occurred_at >= v_today_start

  ORDER BY 1 DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_stats_chart(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_stats_chart(int) TO authenticated;


-- ── 3. compute_daily_stats: ET day boundary + event-based content counts ──────
--
-- Two targeted fixes vs. previous version:
--
--   a) Day boundary: occurred_at::date (UTC) →
--      (occurred_at AT TIME ZONE 'America/New_York')::date (ET)
--      An event at 23:45 ET maps to the correct ET calendar date, not UTC+next-day.
--
--   b) Content counts: COUNT(*) from posts/comments/communities with is_deleted
--      filter (changes when content is deleted) → COUNT(*) from user_activity_events
--      on post_created/comment_created/community_created (immutable after creation).
--
-- Historical snapshots already written (from live-table counts) are NOT
-- backfilled because user_activity_events was empty for pre-logging dates;
-- recomputing them from events would produce 0s which is worse. Those rows
-- retain their live-table-derived counts. Going forward all new snapshots use
-- the event log.

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
  WHERE event_type = 'session_start'
    AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date;

  SELECT COUNT(DISTINCT user_id) INTO v_dau_engaged
  FROM user_activity_events
  WHERE event_type = 'engaged_session'
    AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date;

  SELECT COUNT(DISTINCT user_id) INTO v_dau_action
  FROM user_activity_events
  WHERE event_type IN ('post_created', 'comment_created', 'community_created')
    AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date;

  SELECT COUNT(*) INTO v_posts
  FROM user_activity_events
  WHERE event_type = 'post_created'
    AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date;

  SELECT COUNT(*) INTO v_comments
  FROM user_activity_events
  WHERE event_type = 'comment_created'
    AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date;

  SELECT COUNT(*) INTO v_communities
  FROM user_activity_events
  WHERE event_type = 'community_created'
    AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date;

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
      AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_engaged
    FROM user_activity_events
    WHERE event_type = 'engaged_session'
      AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_action
    FROM user_activity_events
    WHERE event_type IN ('post_created', 'comment_created', 'community_created')
      AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(*) INTO v_posts
    FROM user_activity_events
    WHERE event_type = 'post_created'
      AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(*) INTO v_comments
    FROM user_activity_events
    WHERE event_type = 'comment_created'
      AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(*) INTO v_communities
    FROM user_activity_events
    WHERE event_type = 'community_created'
      AND (occurred_at AT TIME ZONE 'America/New_York')::date = target_date
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
