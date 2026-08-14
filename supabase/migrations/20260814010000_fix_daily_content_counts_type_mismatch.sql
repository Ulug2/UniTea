-- Fixes a pre-existing type mismatch in get_daily_content_counts(), surfaced
-- while live-verifying the Phase 7 university-scoping change (this function
-- is dead code — grep confirms no caller anywhere in src/ or moderation/ —
-- so the bug had never actually been triggered before). SUM(bigint) returns
-- numeric in Postgres, which doesn't match the function's declared `bigint`
-- RETURNS TABLE columns. Unrelated to university scoping; the WHERE clauses
-- from the prior migration are otherwise untouched.
CREATE OR REPLACE FUNCTION public.get_daily_content_counts(p_days integer DEFAULT 14)
RETURNS TABLE(day date, posts bigint, comments bigint, communities bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
  v_since timestamptz;
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := public.get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
  END IF;

  v_since := date_trunc('day', now() AT TIME ZONE 'UTC') - ((p_days - 1) * INTERVAL '1 day');

  RETURN QUERY
  SELECT
    sub.day::date,
    COALESCE(SUM(CASE WHEN sub.tbl = 'posts'       THEN sub.cnt ELSE 0 END), 0)::bigint AS posts,
    COALESCE(SUM(CASE WHEN sub.tbl = 'comments'    THEN sub.cnt ELSE 0 END), 0)::bigint AS comments,
    COALESCE(SUM(CASE WHEN sub.tbl = 'communities' THEN sub.cnt ELSE 0 END), 0)::bigint AS communities
  FROM (
    SELECT created_at::date AS day, 'posts' AS tbl, COUNT(*) AS cnt
    FROM   posts
    WHERE  created_at >= v_since
      AND  (is_deleted IS NULL OR is_deleted = false)
      AND  university_id = v_university_id
    GROUP BY 1

    UNION ALL

    SELECT c.created_at::date AS day, 'comments' AS tbl, COUNT(*) AS cnt
    FROM   comments c
    JOIN   posts p ON p.id = c.post_id
    WHERE  c.created_at >= v_since
      AND  (c.is_deleted IS NULL OR c.is_deleted = false)
      AND  p.university_id = v_university_id
    GROUP BY 1

    UNION ALL

    SELECT created_at::date AS day, 'communities' AS tbl, COUNT(*) AS cnt
    FROM   communities
    WHERE  created_at >= v_since
      AND  university_id = v_university_id
    GROUP BY 1
  ) sub
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$function$;
