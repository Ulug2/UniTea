-- RPC: get_daily_content_counts(p_days)
--
-- Returns one row per calendar day (UTC) for the last p_days days.
-- Used by the moderation dashboard bar chart so it reads from live tables
-- instead of the nightly snapshot cache (which would show stale counts
-- for the current day and disagree with the Content Created panel).
--
-- Granted to authenticated only (moderation admins are authenticated).

CREATE OR REPLACE FUNCTION public.get_daily_content_counts(p_days int DEFAULT 14)
RETURNS TABLE (
  day         date,
  posts       bigint,
  comments    bigint,
  communities bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    sub.day::date,
    COALESCE(SUM(CASE WHEN sub.tbl = 'posts'       THEN sub.cnt ELSE 0 END), 0) AS posts,
    COALESCE(SUM(CASE WHEN sub.tbl = 'comments'    THEN sub.cnt ELSE 0 END), 0) AS comments,
    COALESCE(SUM(CASE WHEN sub.tbl = 'communities' THEN sub.cnt ELSE 0 END), 0) AS communities
  FROM (
    SELECT created_at::date AS day, 'posts' AS tbl, COUNT(*) AS cnt
    FROM   posts
    WHERE  created_at >= now() - (p_days || ' days')::interval
      AND  (is_deleted IS NULL OR is_deleted = false)
    GROUP BY 1

    UNION ALL

    SELECT created_at::date AS day, 'comments' AS tbl, COUNT(*) AS cnt
    FROM   comments
    WHERE  created_at >= now() - (p_days || ' days')::interval
      AND  (is_deleted IS NULL OR is_deleted = false)
    GROUP BY 1

    UNION ALL

    SELECT created_at::date AS day, 'communities' AS tbl, COUNT(*) AS cnt
    FROM   communities
    WHERE  created_at >= now() - (p_days || ' days')::interval
    GROUP BY 1
  ) sub
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_content_counts(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_content_counts(int) TO authenticated;
