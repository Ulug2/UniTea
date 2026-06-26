-- Analytics v2: per-event-type count RPC
--
-- get_event_counts_period(p_days int)
--
-- Returns a row per event type with the total number of times that event
-- occurred in the last p_days calendar days (UTC midnight anchored).
--
-- Time window for p_days = N:
--   occurred_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
--                  - (N-1) * interval '1 day'
--
-- Examples:
--   p_days = 1  → events since today's UTC midnight   (Today)
--   p_days = 7  → events since 6 days ago midnight    (Last 7 days: today + 6 previous)
--   p_days = 30 → events since 29 days ago midnight   (Last 30 days: today + 29 previous)
--
-- Returns COUNT(*) — raw event occurrences, NOT COUNT(DISTINCT user_id).
-- Each event fired by each user increments the count by 1.
--
-- Only callable by admins (get_my_is_admin() check).

CREATE OR REPLACE FUNCTION public.get_event_counts_period(p_days int)
RETURNS TABLE(
  event_type text,
  count      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    uae.event_type,
    COUNT(*)::bigint AS count
  FROM user_activity_events uae
  WHERE occurred_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
                       - ((p_days - 1) * INTERVAL '1 day')
  GROUP BY uae.event_type
  ORDER BY uae.event_type;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_counts_period(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_event_counts_period(int) TO authenticated;

-- Also fix get_daily_content_counts: anchor oldest day to UTC midnight so the
-- day groupings are always complete calendar days, not partial 24-hour slices.
-- Previous version used `now() - (p_days || ' days')::interval` which started
-- from the current clock rather than the start of the day p_days ago.

CREATE OR REPLACE FUNCTION public.get_daily_content_counts(p_days int DEFAULT 14)
RETURNS TABLE (
  day         date,
  posts       bigint,
  comments    bigint,
  communities bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Anchor to the midnight of (today - (p_days-1) days) so we always get
  -- complete calendar days, never a partial leading day.
  v_since := date_trunc('day', now() AT TIME ZONE 'UTC') - ((p_days - 1) * INTERVAL '1 day');

  RETURN QUERY
  SELECT
    sub.day::date,
    COALESCE(SUM(CASE WHEN sub.tbl = 'posts'       THEN sub.cnt ELSE 0 END), 0) AS posts,
    COALESCE(SUM(CASE WHEN sub.tbl = 'comments'    THEN sub.cnt ELSE 0 END), 0) AS comments,
    COALESCE(SUM(CASE WHEN sub.tbl = 'communities' THEN sub.cnt ELSE 0 END), 0) AS communities
  FROM (
    SELECT created_at::date AS day, 'posts' AS tbl, COUNT(*) AS cnt
    FROM   posts
    WHERE  created_at >= v_since
      AND  (is_deleted IS NULL OR is_deleted = false)
    GROUP BY 1

    UNION ALL

    SELECT created_at::date AS day, 'comments' AS tbl, COUNT(*) AS cnt
    FROM   comments
    WHERE  created_at >= v_since
      AND  (is_deleted IS NULL OR is_deleted = false)
    GROUP BY 1

    UNION ALL

    SELECT created_at::date AS day, 'communities' AS tbl, COUNT(*) AS cnt
    FROM   communities
    WHERE  created_at >= v_since
    GROUP BY 1
  ) sub
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_content_counts(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_content_counts(int) TO authenticated;
