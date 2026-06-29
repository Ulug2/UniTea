-- Fix two regressions introduced by the June 2026 security hardening:
--
-- (1) Block filter broken for anonymous posts (C1 regression).
--     C1 redacted user_id = NULL for other users' anonymous posts so that viewers
--     cannot discover the real author.  The client-side isBlockedPost() function
--     returns false when userId is null (its null guard at line 71 of useBlocks.ts),
--     so blocked users' anonymous posts were no longer hidden from their blockers.
--
--     Fix: Add is_author_blocked_by_viewer and is_original_author_blocked_by_viewer
--     boolean columns to posts_summary_view.  These subqueries run against the REAL
--     p.user_id / op.user_id BEFORE the CASE redaction, so they correctly identify
--     blocked anonymous-post authors without exposing their identity to the client.
--     The view has security_invoker=true so auth.uid() resolves to the calling user.
--     Client feeds replace the local isBlockedPost(blocks, ...) call with these
--     server-computed booleans, eliminating the dependency on client-side block lists
--     for feed filtering.
--
-- (2) compute_daily_stats() not callable by service_role (H3 regression).
--     20260621110000 revoked EXECUTE from PUBLIC then granted only to authenticated.
--     20260628000000 then revoked from authenticated (correct: no direct client call).
--     Result: only the postgres superuser retained EXECUTE; service_role was never
--     explicitly granted.  The compute-daily-stats edge function creates a client
--     with SUPABASE_SERVICE_ROLE_KEY and calls this RPC — it would fail with
--     "permission denied for function compute_daily_stats".
--     Fix: GRANT EXECUTE TO service_role.

-- ── (1) Recreate posts_summary_view with block-detection columns ─────────────

DROP VIEW IF EXISTS public.posts_summary_view;

CREATE VIEW public.posts_summary_view AS
SELECT
    p.id                      AS post_id,

    -- C1: Redact real user_id for another user's anonymous post.
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
    op.title           AS original_title,

    -- Server-side block detection using the REAL user_id (before redaction above).
    -- Mirrors the isBlockedPost() client function exactly:
    --   anonymous_only blocks hide the author's anonymous posts.
    --   profile_only blocks hide the author's non-anonymous posts.
    --   Reverse blocks (author blocked the viewer) hide non-anonymous posts.
    (
      EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE b.blocker_id = auth.uid()
          AND b.blocked_id = p.user_id
          AND (
            (b.block_scope = 'anonymous_only' AND p.is_anonymous IS TRUE)
            OR (b.block_scope = 'profile_only' AND p.is_anonymous IS NOT TRUE)
          )
      )
      OR (
        p.is_anonymous IS NOT TRUE
        AND EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = p.user_id
            AND b.blocked_id = auth.uid()
        )
      )
    ) AS is_author_blocked_by_viewer,

    -- Same check for the original (reposted) post's author.
    CASE WHEN op.id IS NOT NULL THEN (
      EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE b.blocker_id = auth.uid()
          AND b.blocked_id = op.user_id
          AND (
            (b.block_scope = 'anonymous_only' AND op.is_anonymous IS TRUE)
            OR (b.block_scope = 'profile_only' AND op.is_anonymous IS NOT TRUE)
          )
      )
      OR (
        op.is_anonymous IS NOT TRUE
        AND EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = op.user_id
            AND b.blocked_id = auth.uid()
        )
      )
    ) ELSE false END AS is_original_author_blocked_by_viewer

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


-- ── (2) Restore EXECUTE on compute_daily_stats for service_role ──────────────

GRANT EXECUTE ON FUNCTION public.compute_daily_stats(date) TO service_role;
