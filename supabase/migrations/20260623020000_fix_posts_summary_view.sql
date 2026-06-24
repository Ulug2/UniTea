-- ============================================================
-- Recreate posts_summary_view with the full column set.
--
-- The view in the live database was missing community_id,
-- university_id, hot_score, image_urls, community_name,
-- university_domain and other columns because the communities
-- migration (20260612120000) was marked as applied via
-- `migration repair` without its CREATE VIEW statement
-- actually executing on the remote database.
--
-- The client queries .is("community_id", null) which caused
-- PostgREST to return a 400 error, silently emptying the feed.
-- ============================================================

DROP VIEW IF EXISTS public.posts_summary_view;

CREATE VIEW public.posts_summary_view AS
SELECT
    p.id                      AS post_id,
    p.user_id,
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

    pr.username,
    pr.avatar_url,
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
    op.user_id         AS original_user_id,
    opr.username       AS original_author_username,
    opr.avatar_url     AS original_author_avatar,
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

-- Preserve grants: authenticated can read, anon cannot.
REVOKE ALL ON public.posts_summary_view FROM PUBLIC;
GRANT SELECT ON public.posts_summary_view TO authenticated;
