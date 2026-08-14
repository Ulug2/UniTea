-- ============================================================
-- Phase 7 — University Isolation: Content Interactions,
-- Anonymous Chat, Analytics
-- ============================================================
-- Fixes the three live-verified cross-university vulnerabilities found by
-- the Phase 6 read-only audit, plus the 7 unscoped analytics RPCs it also
-- flagged. Schema/relationships were re-verified live against the deployed
-- database before writing this migration (see Phase 7 report).

-- ── GROUP 1 — Content interaction RLS ─────────────────────────
-- comments.post_id -> posts.id -> posts.university_id  (direct)
-- votes.post_id -> posts.id  OR  votes.comment_id -> comments.post_id -> posts.id
--   (votes_target_check guarantees exactly one of post_id/comment_id is set)
-- poll_options.poll_id -> polls.id -> polls.post_id -> posts.id
-- poll_votes.poll_id -> polls.id -> polls.post_id -> posts.id  (poll_votes
--   carries poll_id directly, so no need to route through poll_options)
-- post_stats.post_id -> posts.id  (direct, PK)
--
-- Postgres applies a referenced table's own RLS to any query against it,
-- including inside another table's policy predicate — so these EXISTS
-- checks automatically also respect posts'/comments' own is_deleted and
-- university filters with no need to repeat them explicitly.

-- comments: SELECT
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.comments;
CREATE POLICY "Allow read for authenticated"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- comments: INSERT — preserves the existing (auth.uid() = user_id OR user_id
-- IS NULL) ownership branch untouched; adds the missing university boundary
-- as an independent AND condition covering both branches. auth.uid() = user_id
-- alone was never sufficient — nothing previously verified post_id belonged
-- to the caller's own university.
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.comments;
CREATE POLICY "Allow insert for authenticated"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.uid() = user_id) OR (user_id IS NULL))
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- votes: SELECT — handles both post-votes and comment-votes.
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.votes;
CREATE POLICY "Allow read for authenticated"
  ON public.votes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = votes.post_id
        AND p.university_id = public.get_my_university_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.comments c
      JOIN public.posts p ON p.id = c.post_id
      WHERE c.id = votes.comment_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- votes: INSERT — preserves existing self-ownership check, adds the
-- university boundary for whichever target (post or comment) is set.
DROP POLICY IF EXISTS "allow insert for authenticated" ON public.votes;
CREATE POLICY "allow insert for authenticated"
  ON public.votes FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = user_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = votes.post_id
          AND p.university_id = public.get_my_university_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.comments c
        JOIN public.posts p ON p.id = c.post_id
        WHERE c.id = votes.comment_id
          AND p.university_id = public.get_my_university_id()
      )
    )
  );

-- poll_votes: SELECT
DROP POLICY IF EXISTS "Anyone can view poll votes" ON public.poll_votes;
CREATE POLICY "Anyone can view poll votes"
  ON public.poll_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.polls pl
      JOIN public.posts p ON p.id = pl.post_id
      WHERE pl.id = poll_votes.poll_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- poll_votes: INSERT — preserves existing self-ownership check, adds the
-- university boundary via the poll's owning post.
DROP POLICY IF EXISTS "Users can vote for themselves" ON public.poll_votes;
CREATE POLICY "Users can vote for themselves"
  ON public.poll_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.polls pl
      JOIN public.posts p ON p.id = pl.post_id
      WHERE pl.id = poll_votes.poll_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- poll_options: SELECT only. INSERT/UPDATE/DELETE already require
-- posts.user_id = auth.uid() (the caller must own the underlying post),
-- which already implies same-university by construction — left untouched.
DROP POLICY IF EXISTS "Anyone can view poll options" ON public.poll_options;
CREATE POLICY "Anyone can view poll options"
  ON public.poll_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.polls pl
      JOIN public.posts p ON p.id = pl.post_id
      WHERE pl.id = poll_options.poll_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- post_stats: SELECT only. No INSERT/UPDATE/DELETE policy exists for any
-- role today (rows are written exclusively by SECURITY DEFINER triggers
-- fn_init_post_stats/fn_update_comment_count/fn_update_vote_score/
-- fn_update_repost_count, which bypass RLS) — left untouched.
DROP POLICY IF EXISTS "post_stats_select_authenticated" ON public.post_stats;
CREATE POLICY "post_stats_select_authenticated"
  ON public.post_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_stats.post_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- comments_with_details is security_invoker = true and joins comments (base
-- table) directly — no view change needed; it transparently inherits the
-- newly-scoped comments SELECT policy above. Verified live post-deploy.


-- ── GROUP 2 — initiate_anonymous_chat(): add the missing university check ──
-- SECURITY DEFINER bypasses both the posts SELECT RLS and the chats "Insert
-- chats within same university" RLS, so the boundary must be enforced here
-- explicitly. Every other line of the original function is unchanged.
CREATE OR REPLACE FUNCTION public.initiate_anonymous_chat(p_post_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id             uuid := auth.uid();
  v_author_id             uuid;
  v_caller_university_id  uuid;
  v_author_university_id  uuid;
  v_chat_id               uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Read the real author from the base table, bypassing view redaction.
  SELECT user_id INTO v_author_id
  FROM public.posts
  WHERE id = p_post_id
    AND is_anonymous = true
    AND (is_deleted = false OR is_deleted IS NULL);

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'post not found or not anonymous';
  END IF;

  -- University isolation: never trust posts/chats RLS to catch this for a
  -- SECURITY DEFINER caller — resolve and compare explicitly, and fail
  -- closed if either side is unresolvable.
  SELECT university_id INTO v_caller_university_id
  FROM public.profiles WHERE id = v_caller_id;

  SELECT university_id INTO v_author_university_id
  FROM public.profiles WHERE id = v_author_id;

  IF v_caller_university_id IS NULL OR v_author_university_id IS NULL THEN
    RAISE EXCEPTION 'unable to resolve university for caller or post author';
  END IF;

  IF v_caller_university_id <> v_author_university_id THEN
    RAISE EXCEPTION 'cannot initiate an anonymous chat across universities';
  END IF;

  IF v_caller_id = v_author_id THEN
    RAISE EXCEPTION 'cannot start a chat with yourself';
  END IF;

  -- Return existing chat for this (post, initiator) pair.
  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE post_id    = p_post_id
    AND initiator_id = v_caller_id
    AND is_anonymous = true;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Insert; handle the race where two requests land simultaneously.
  BEGIN
    INSERT INTO public.chats (
      participant_1_id, participant_2_id,
      post_id, initiator_id, is_anonymous
    ) VALUES (
      v_caller_id, v_author_id,
      p_post_id, v_caller_id, true
    )
    RETURNING id INTO v_chat_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_chat_id
    FROM public.chats
    WHERE post_id    = p_post_id
      AND initiator_id = v_caller_id
      AND is_anonymous = true;
  END;

  RETURN v_chat_id;
END;
$function$;


-- ── GROUP 3 — University-scope all 7 analytics RPCs ───────────
-- Each function is unchanged except: resolve public.get_my_university_id()
-- once after the admin check (fail closed if NULL), then apply it to every
-- underlying aggregate. comments has no university_id of its own, so its
-- branch is resolved via a join to posts.

CREATE OR REPLACE FUNCTION public.get_analytics_summary()
RETURNS TABLE(dau_app_opens bigint, dau_posts bigint, dau_comments bigint, dau_communities bigint, wau_app_opens bigint, wau_posts bigint, wau_comments bigint, wau_communities bigint, mau_app_opens bigint, mau_posts bigint, mau_comments bigint, mau_communities bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
  v_today_start timestamptz;
  v_wau_start   timestamptz;
  v_mau_start   timestamptz;
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := public.get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
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
  WHERE occurred_at >= v_mau_start -- bound the scan to last 30 days
    AND university_id = v_university_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_daily_stats_chart(p_days integer DEFAULT 90)
RETURNS TABLE(et_date date, dau bigint, posts bigint, comments bigint, communities bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
  v_today_et    date;
  v_today_start timestamptz;
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := public.get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
  END IF;

  v_today_et    := (now() AT TIME ZONE 'America/New_York')::date;
  v_today_start := date_trunc('day', now() AT TIME ZONE 'America/New_York')
                     AT TIME ZONE 'America/New_York';

  RETURN QUERY

  -- Completed days: snapshots (per-university rows, not the platform-wide
  -- university_id IS NULL row).
  SELECT
    s.snapshot_date,
    s.dau_basic::bigint,
    s.posts_created::bigint,
    s.comments_created::bigint,
    s.communities_created::bigint
  FROM daily_stats_snapshots s
  WHERE s.university_id = v_university_id
    AND s.snapshot_date >= v_today_et - (p_days - 1)
    AND s.snapshot_date <  v_today_et

  UNION ALL

  -- Today: live event counts, ET-anchored, scoped to caller's university.
  SELECT
    v_today_et,
    COUNT(DISTINCT CASE WHEN event_type = 'session_start' THEN user_id END)::bigint,
    COUNT(*) FILTER (WHERE event_type = 'post_created')::bigint,
    COUNT(*) FILTER (WHERE event_type = 'comment_created')::bigint,
    COUNT(*) FILTER (WHERE event_type = 'community_created')::bigint
  FROM user_activity_events
  WHERE occurred_at >= v_today_start
    AND university_id = v_university_id

  ORDER BY 1 DESC;
END;
$function$;


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
      AND  university_id = v_university_id
    GROUP BY 1

    UNION ALL

    -- comments has no university_id of its own; resolve via its post.
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


CREATE OR REPLACE FUNCTION public.get_event_counts_period(p_days integer)
RETURNS TABLE(event_type text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
BEGIN
  IF NOT public.get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := public.get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
  END IF;

  RETURN QUERY
  SELECT
    uae.event_type,
    COUNT(*)::bigint AS count
  FROM user_activity_events uae
  WHERE occurred_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
                       - ((p_days - 1) * INTERVAL '1 day')
    AND uae.university_id = v_university_id
  GROUP BY uae.event_type
  ORDER BY uae.event_type;
END;
$function$;


CREATE OR REPLACE FUNCTION public.count_distinct_active_users(p_event text, p_days integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
  END IF;

  RETURN (
    SELECT COUNT(DISTINCT user_id)
    FROM user_activity_events
    WHERE event_type = p_event
      AND occurred_at >= now() - (p_days || ' days')::interval
      AND university_id = v_university_id
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.count_distinct_active_users_action(p_days integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
  END IF;

  RETURN (
    SELECT COUNT(DISTINCT user_id)
    FROM user_activity_events
    WHERE event_type IN ('post_created', 'comment_created', 'community_created')
      AND occurred_at >= now() - (p_days || ' days')::interval
      AND university_id = v_university_id
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.count_today_dau(p_since timestamp with time zone)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
  END IF;

  RETURN (
    SELECT COUNT(DISTINCT user_id)
    FROM user_activity_events
    WHERE occurred_at >= p_since
      AND event_type = 'session_start'
      AND university_id = v_university_id
  );
END;
$function$;
