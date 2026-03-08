-- ============================================================
-- Migration: Add "title" column to posts (used by Lost & Found)
-- and expose it through posts_summary_view.
-- ============================================================

-- ── 1. Add column ─────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS title text;

-- ── 2. Recreate posts_summary_view to include title ───────
-- DROP first because CREATE OR REPLACE VIEW cannot change column positions.
-- Dropping requires no dependent objects; RLS policies live on the
-- underlying tables, not the view, so nothing is lost.
DROP VIEW IF EXISTS public.posts_summary_view;

CREATE VIEW public.posts_summary_view AS
SELECT
    p.id                                                              AS post_id,
    p.user_id,
    p.content,
    p.title,
    p.image_url,
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

    -- comment count (excludes soft-deleted comments)
    (
        SELECT COUNT(*)::int
        FROM public.comments c
        WHERE c.post_id = p.id
          AND (c.is_deleted IS NULL OR c.is_deleted = FALSE)
    ) AS comment_count,

    -- net vote score
    (
        SELECT COALESCE(
            SUM(CASE
                WHEN v.vote_type = 'upvote'   THEN  1
                WHEN v.vote_type = 'downvote' THEN -1
                ELSE 0
            END), 0
        )::int
        FROM public.votes v
        WHERE v.post_id = p.id
    ) AS vote_score,

    -- current viewer's vote (NULL when not logged in or not voted)
    (
        SELECT v2.vote_type
        FROM public.votes v2
        WHERE v2.post_id = p.id
          AND v2.user_id = auth.uid()
        LIMIT 1
    ) AS user_vote,

    -- number of times this post has been reposted
    (
        SELECT COUNT(*)::int
        FROM public.posts r
        WHERE r.reposted_from_post_id = p.id
    ) AS repost_count,

    -- original post fields (populated only for reposts)
    op.id              AS original_post_id,
    op.content         AS original_content,
    op.user_id         AS original_user_id,
    opr.username       AS original_author_username,
    opr.avatar_url     AS original_author_avatar,
    op.image_url       AS original_image_url,
    op.is_anonymous    AS original_is_anonymous,
    op.created_at      AS original_created_at

FROM public.posts p
JOIN  public.profiles pr  ON p.user_id              = pr.id
LEFT JOIN public.posts op     ON p.reposted_from_post_id = op.id
LEFT JOIN public.profiles opr ON op.user_id             = opr.id;
