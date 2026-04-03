-- Expose reposted original post titles in posts_summary_view.
-- This lets clients render original title in repost preview cards.

BEGIN;

CREATE OR REPLACE VIEW public.posts_summary_view AS
SELECT
    p.id                      AS post_id,
    p.user_id,
    p.content,
    p.title,
    p.image_url,
    p.image_urls,
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

    pr.username,
    pr.avatar_url,
    pr.is_verified,
    pr.is_banned,

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
    op.is_anonymous    AS original_is_anonymous,
    op.created_at      AS original_created_at,
    op.title           AS original_title

FROM public.posts p
JOIN  public.profiles pr       ON p.user_id = pr.id
LEFT JOIN public.post_stats ps ON ps.post_id = p.id
LEFT JOIN public.posts op      ON p.reposted_from_post_id = op.id
LEFT JOIN public.profiles opr  ON op.user_id = opr.id

WHERE p.is_deleted = FALSE OR p.is_deleted IS NULL;

ALTER VIEW public.posts_summary_view SET (security_invoker = true);
REVOKE ALL ON public.posts_summary_view FROM PUBLIC;
GRANT SELECT ON public.posts_summary_view TO authenticated;

COMMIT;
