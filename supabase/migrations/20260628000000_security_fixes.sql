-- Security fixes 2026-06-28
--
-- C3: Prevent any authenticated user from promoting themselves to admin,
--     self-unbanning, or changing their university via the profile UPDATE API.
-- C1: Redact real user_id/username/avatar from posts_summary_view for
--     other users' anonymous posts so anonymity is enforced at the DB layer.
-- H2: Add unique indexes on votes to prevent duplicate-vote inflation via
--     direct API calls.
-- H3: Lock compute_daily_stats() out of the authenticated role so it can
--     only be triggered by the service role (cron) or postgres superuser.

-- ── C3: Profile column privilege escalation guard ──────────────────────────

-- Re-create the UPDATE policy with an explicit WITH CHECK.
-- The previous version had only USING (id = auth.uid()), which PostgreSQL
-- doubles as both the row filter and the post-update check when WITH CHECK
-- is absent — but that only verifies row ownership, not which column values
-- are written.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Trigger that blocks changes to is_admin, is_banned, and university_id
-- by any authenticated caller. The service role (used by ban-user /
-- unban-user edge functions) is exempt.
CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'permission denied: is_admin cannot be changed';
  END IF;

  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'permission denied: is_banned cannot be changed';
  END IF;

  IF NEW.university_id IS DISTINCT FROM OLD.university_id THEN
    RAISE EXCEPTION 'permission denied: university_id cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_sensitive_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_sensitive_columns();

-- ── C1: Redact identity fields in posts_summary_view for anonymous posts ──

DROP VIEW IF EXISTS public.posts_summary_view;

CREATE VIEW public.posts_summary_view AS
SELECT
    p.id                      AS post_id,

    -- Redact real user_id for another user's anonymous post.
    -- security_invoker=true means auth.uid() resolves to the calling user,
    -- so a user can still see their own user_id on their own anonymous posts
    -- (needed for edit/delete buttons).
    CASE WHEN p.is_anonymous AND p.user_id != auth.uid()
         THEN NULL ELSE p.user_id END AS user_id,

    p.content,
    p.title,
    p.image_url,
    p.image_urls,
    p.image_aspect_ratio,
    p.category,
    p.location,
    p.post_type,
    p.is_anonymous,
    p.is_deleted,
    p.is_edited,
    p.created_at,
    p.updated_at,
    p.edited_at,
    p.view_count,
    p.repost_comment,
    p.reposted_from_post_id,
    p.university_id,
    p.community_id,

    CASE WHEN p.is_anonymous AND p.user_id != auth.uid()
         THEN NULL ELSE pr.username END AS username,
    CASE WHEN p.is_anonymous AND p.user_id != auth.uid()
         THEN NULL ELSE pr.avatar_url END AS avatar_url,
    pr.is_verified,
    pr.is_banned,

    u.domain                  AS university_domain,
    c.name                    AS community_name,
    c.avatar_url              AS community_avatar_url,

    COALESCE(ps.comment_count, 0) AS comment_count,
    COALESCE(ps.vote_score,    0) AS vote_score,
    COALESCE(ps.repost_count,  0) AS repost_count,
    CAST(
      (
        (
          ABS(COALESCE(ps.vote_score, 0))
          + COALESCE(ps.comment_count, 0) * 2
          + COALESCE(ps.repost_count, 0) * 3
        ) * 1000
      )
      /
      POWER(
        (
          GREATEST(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(p.created_at, NOW()))) / 3600.0,
            0
          ) + 2
        ),
        1.3
      )
      AS INTEGER
    ) AS hot_score,

    (
        SELECT v.vote_type
        FROM public.votes v
        WHERE v.post_id = p.id
          AND v.user_id = auth.uid()
        LIMIT 1
    ) AS user_vote,

    op.id              AS original_post_id,
    op.content         AS original_content,
    -- Never reveal real identity for anonymous original (reposted) posts.
    CASE WHEN op.is_anonymous THEN NULL
         ELSE op.user_id END   AS original_user_id,
    CASE WHEN op.is_anonymous THEN NULL
         ELSE opr.username END AS original_author_username,
    CASE WHEN op.is_anonymous THEN NULL
         ELSE opr.avatar_url END AS original_author_avatar,
    op.image_url       AS original_image_url,
    op.image_urls      AS original_image_urls,
    op.image_aspect_ratio AS original_image_aspect_ratio,
    op.is_anonymous    AS original_is_anonymous,
    op.created_at      AS original_created_at,
    op.title           AS original_title

FROM public.posts p
JOIN  public.profiles pr         ON p.user_id = pr.id
LEFT JOIN public.post_stats ps   ON ps.post_id = p.id
LEFT JOIN public.posts op        ON p.reposted_from_post_id = op.id
LEFT JOIN public.profiles opr    ON op.user_id = opr.id
LEFT JOIN public.universities u  ON p.university_id = u.id
LEFT JOIN public.communities c   ON p.community_id = c.id

WHERE p.is_deleted = FALSE OR p.is_deleted IS NULL;

ALTER VIEW public.posts_summary_view SET (security_invoker = true);

REVOKE ALL ON public.posts_summary_view FROM PUBLIC;
GRANT SELECT ON public.posts_summary_view TO authenticated;

-- ── H2: Unique indexes on votes to prevent duplicate-vote inflation ─────────

-- Without these indexes, upsert with onConflict silently falls back to INSERT
-- when the index is absent, allowing multiple votes on the same post/comment.
CREATE UNIQUE INDEX IF NOT EXISTS votes_user_post_unique
  ON public.votes(user_id, post_id)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS votes_user_comment_unique
  ON public.votes(user_id, comment_id)
  WHERE comment_id IS NOT NULL;

-- ── H3: Restrict compute_daily_stats to service role only ─────────────────

-- The v3 analytics migration (20260627000000) replaced this function without
-- the admin guard that was in 20260621100000. Rather than adding an admin
-- check inside the function (which would block the service-role cron call
-- since auth.uid() is NULL for service role), we remove execute access from
-- authenticated entirely. The function remains callable by the service role
-- (used by the compute-daily-stats edge function and pg_cron) and by the
-- postgres superuser. Admin users invoke it exclusively through the
-- compute-daily-stats edge function, which enforces the admin check there.
REVOKE EXECUTE ON FUNCTION public.compute_daily_stats(date) FROM authenticated;
