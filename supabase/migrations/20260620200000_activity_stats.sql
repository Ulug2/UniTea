-- Activity statistics: event ingestion + daily snapshots + aggregation function.
-- Two-layer architecture: mobile inserts raw events; a daily cron aggregates them
-- into daily_stats_snapshots so the dashboard never runs live COUNT DISTINCT queries.

-- ── 1. user_activity_events ─────────────────────────────────────────────────

CREATE TABLE public.user_activity_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id uuid        NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  event_type    text        NOT NULL CHECK (event_type IN (
    'session_start',
    'engaged_session',
    'post_created',
    'comment_created',
    'community_created'
  )),
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_events_occurred_at ON public.user_activity_events (occurred_at DESC);
CREATE INDEX idx_activity_events_user_date   ON public.user_activity_events (user_id, occurred_at DESC);

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events"
  ON public.user_activity_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all events"
  ON public.user_activity_events FOR SELECT
  USING (public.get_my_is_admin());

-- ── 2. daily_stats_snapshots ─────────────────────────────────────────────────

CREATE TABLE public.daily_stats_snapshots (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date       date        NOT NULL,
  university_id       uuid        REFERENCES public.universities(id) ON DELETE CASCADE,
  -- NULL university_id = platform-wide aggregate

  -- DAU tiers (unique users with ≥1 matching event on this date)
  dau_basic           int         NOT NULL DEFAULT 0,
  dau_engaged         int         NOT NULL DEFAULT 0,
  dau_action          int         NOT NULL DEFAULT 0,

  -- Content created on this date (raw counts, not unique users)
  posts_created       int         NOT NULL DEFAULT 0,
  comments_created    int         NOT NULL DEFAULT 0,
  communities_created int         NOT NULL DEFAULT 0,

  computed_at         timestamptz NOT NULL DEFAULT now()
  -- No table-level UNIQUE: PG 14 treats NULLs as distinct in unique constraints,
  -- breaking ON CONFLICT for the platform-wide row. Two partial indexes below
  -- enforce uniqueness correctly for each case.
);

-- Platform-wide rows (university_id IS NULL): one per date
CREATE UNIQUE INDEX idx_snapshots_date_global
  ON public.daily_stats_snapshots (snapshot_date)
  WHERE university_id IS NULL;

-- Per-university rows: one per (date, university)
CREATE UNIQUE INDEX idx_snapshots_date_university
  ON public.daily_stats_snapshots (snapshot_date, university_id)
  WHERE university_id IS NOT NULL;

CREATE INDEX idx_snapshots_date ON public.daily_stats_snapshots (snapshot_date DESC);

ALTER TABLE public.daily_stats_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read snapshots"
  ON public.daily_stats_snapshots FOR SELECT
  USING (public.get_my_is_admin());

CREATE POLICY "Service role can write snapshots"
  ON public.daily_stats_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── 3. compute_daily_stats ───────────────────────────────────────────────────

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

  -- comments has no university_id; join not needed for platform-wide count
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

    -- Join comments → posts to scope by university
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

-- ── 4. Helper RPCs for dashboard precise WAU/MAU ─────────────────────────────

-- COUNT DISTINCT for a single event type over the last N days
CREATE OR REPLACE FUNCTION public.count_distinct_active_users(
  p_event text,
  p_days  int
) RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)
  FROM user_activity_events
  WHERE event_type = p_event
    AND occurred_at >= now() - (p_days || ' days')::interval;
$$;

-- COUNT DISTINCT for action-tier events (post + comment + community) over N days
CREATE OR REPLACE FUNCTION public.count_distinct_active_users_action(
  p_days int
) RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)
  FROM user_activity_events
  WHERE event_type IN ('post_created', 'comment_created', 'community_created')
    AND occurred_at >= now() - (p_days || ' days')::interval;
$$;

-- Today's live basic DAU (fast: only scans today's rows via occurred_at index)
CREATE OR REPLACE FUNCTION public.count_today_dau(
  p_since timestamptz
) RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)
  FROM user_activity_events
  WHERE occurred_at >= p_since
    AND event_type = 'session_start';
$$;

-- ── 5. Schedule via pg_cron ──────────────────────────────────────────────────
-- Run this block AFTER enabling pg_cron in:
--   Supabase Dashboard → Database → Extensions → search "pg_cron" → Enable
--
-- Then paste the SELECT below into the SQL Editor and run it once:
--
--   SELECT cron.schedule(
--     'compute-daily-stats',
--     '5 0 * * *',
--     $$SELECT public.compute_daily_stats((CURRENT_DATE - INTERVAL '1 day')::date)$$
--   );
--
-- To verify the job was registered:  SELECT * FROM cron.job;
-- To remove it later:                SELECT cron.unschedule('compute-daily-stats');
