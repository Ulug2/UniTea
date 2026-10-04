-- ============================================================
-- Market posts: a second "board" post type next to Lost & Found
-- ============================================================
-- The Lost & Found tab becomes "Market" with two segments: things for sale
-- (post_type = 'market') and Lost & Found (post_type = 'lost_found',
-- unchanged).
--
-- Backward compatibility (installed builds 1.1.0 / 1.2.0):
--   * Purely additive: one more allowed post_type value, one new nullable
--     column, one new column appended to the END of posts_summary_view.
--     Nothing is renamed or dropped.
--   * Old builds list Lost & Found with post_type = 'lost_found' and the
--     feeds with post_type = 'feed', so they never list market posts there.
--     They cannot create market posts either (their create form only sends
--     'feed' / 'lost_found').
--   * Old builds' profile lists and post detail read posts_summary_view
--     without a post_type filter, so a market post there renders as an
--     ordinary post (title + text, no price). Degraded, not broken.
--   * Existing rows are untouched: price is NULL for every current post.
--
-- Rollback:
--   (only safe while no market rows exist)
--   CREATE OR REPLACE VIEW cannot drop a column, so: DROP VIEW
--   public.posts_summary_view; re-run the view block of
--   20260726000002_narrow_anonymous_block_to_originating_post.sql; then
--   ALTER TABLE public.posts DROP CONSTRAINT posts_price_check,
--     DROP COLUMN price;
--   ALTER TABLE public.posts DROP CONSTRAINT posts_post_type_check;
--   ALTER TABLE public.posts ADD CONSTRAINT posts_post_type_check
--     CHECK (post_type = ANY (ARRAY['feed'::text, 'lost_found'::text]));
-- ============================================================

-- 1. Allow the new post type.
ALTER TABLE public.posts DROP CONSTRAINT posts_post_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_post_type_check
  CHECK (post_type = ANY (ARRAY['feed'::text, 'lost_found'::text, 'market'::text]));

-- 2. Optional price in whole tenge, market posts only.
ALTER TABLE public.posts ADD COLUMN price integer;
ALTER TABLE public.posts ADD CONSTRAINT posts_price_check
  CHECK (price IS NULL OR (post_type = 'market' AND price >= 0));

-- 3. Expose price on posts_summary_view. Identical to the live definition
--    with p.price appended as the last column (CREATE OR REPLACE VIEW only
--    allows adding columns at the end).
CREATE OR REPLACE VIEW public.posts_summary_view
WITH (security_invoker = true) AS
SELECT
    p.id AS post_id,
    CASE
        WHEN p.is_anonymous AND p.user_id <> auth.uid() THEN NULL::uuid
        ELSE p.user_id
    END AS user_id,
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
    CASE
        WHEN p.is_anonymous AND p.user_id <> auth.uid() THEN NULL::text
        ELSE pr.username
    END AS username,
    CASE
        WHEN p.is_anonymous AND p.user_id <> auth.uid() THEN NULL::text
        ELSE pr.avatar_url
    END AS avatar_url,
    pr.is_verified,
    pr.is_banned,
    u.domain AS university_domain,
    c.name AS community_name,
    c.avatar_url AS community_avatar_url,
    COALESCE(ps.comment_count, 0) AS comment_count,
    COALESCE(ps.vote_score, 0) AS vote_score,
    COALESCE(ps.repost_count, 0) AS repost_count,
    (((abs(COALESCE(ps.vote_score, 0)) + COALESCE(ps.comment_count, 0) * 2 + COALESCE(ps.repost_count, 0) * 3) * 1000)::numeric / power(GREATEST(EXTRACT(epoch FROM now() - COALESCE(p.created_at, now())) / 3600.0, 0::numeric) + 2::numeric, 1.3))::integer AS hot_score,
    ( SELECT v.vote_type
        FROM public.votes v
       WHERE v.post_id = p.id AND v.user_id = auth.uid()
       LIMIT 1) AS user_vote,
    op.id AS original_post_id,
    op.content AS original_content,
    CASE
        WHEN op.is_anonymous THEN NULL::uuid
        ELSE op.user_id
    END AS original_user_id,
    CASE
        WHEN op.is_anonymous THEN NULL::text
        ELSE opr.username
    END AS original_author_username,
    CASE
        WHEN op.is_anonymous THEN NULL::text
        ELSE opr.avatar_url
    END AS original_author_avatar,
    op.image_url AS original_image_url,
    op.image_urls AS original_image_urls,
    op.image_aspect_ratio AS original_image_aspect_ratio,
    op.is_anonymous AS original_is_anonymous,
    op.created_at AS original_created_at,
    op.title AS original_title,
    (EXISTS ( SELECT 1
           FROM public.blocks b
          WHERE b.blocker_id = auth.uid() AND b.blocked_id = p.user_id AND b.block_scope = 'profile_only'::text AND p.is_anonymous IS NOT TRUE)) OR p.is_anonymous IS NOT TRUE AND (EXISTS ( SELECT 1
           FROM public.blocks b
          WHERE b.blocker_id = p.user_id AND b.blocked_id = auth.uid() AND b.block_scope = 'profile_only'::text)) OR p.is_anonymous IS TRUE AND public.is_anonymous_chat_post_blocked(p.id, p.user_id) AS is_author_blocked_by_viewer,
    CASE
        WHEN op.id IS NOT NULL THEN (EXISTS ( SELECT 1
           FROM public.blocks b
          WHERE b.blocker_id = auth.uid() AND b.blocked_id = op.user_id AND b.block_scope = 'profile_only'::text AND op.is_anonymous IS NOT TRUE)) OR op.is_anonymous IS NOT TRUE AND (EXISTS ( SELECT 1
           FROM public.blocks b
          WHERE b.blocker_id = op.user_id AND b.blocked_id = auth.uid() AND b.block_scope = 'profile_only'::text)) OR op.is_anonymous IS TRUE AND public.is_anonymous_chat_post_blocked(op.id, op.user_id)
        ELSE false
    END AS is_original_author_blocked_by_viewer,
    p.price
FROM public.posts p
JOIN public.profiles pr ON p.user_id = pr.id
LEFT JOIN public.post_stats ps ON ps.post_id = p.id
LEFT JOIN public.posts op ON p.reposted_from_post_id = op.id
LEFT JOIN public.profiles opr ON op.user_id = opr.id
LEFT JOIN public.universities u ON p.university_id = u.id
LEFT JOIN public.communities c ON p.community_id = c.id
WHERE p.is_deleted = false OR p.is_deleted IS NULL;

-- Grants are deliberately not restated: CREATE OR REPLACE VIEW keeps the
-- existing ones, and this migration must not change who can read the view.
