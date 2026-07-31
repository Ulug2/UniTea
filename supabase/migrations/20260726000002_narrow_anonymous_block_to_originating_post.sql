-- ============================================================
-- Narrow anonymous_only post-hiding to only the post that started the
-- specific anonymous chat being blocked (product clarification, not a
-- security fix on top of 20260726000000).
-- ============================================================
--
-- 20260726000000 made block_chat_partner store anonymous_only instead of
-- profile_only, and made posts_summary_view hide the author's anonymous
-- posts for an anonymous_only block. That's correct as far as "don't hide
-- their non-anonymous posts" goes, but it was too broad in the other
-- direction: it hid EVERY anonymous post the blocked person has, not just
-- the one that started this specific conversation.
--
-- Every anonymous chat is created from exactly one anonymous post
-- (chats.post_id, set by initiate_anonymous_chat -- confirmed in
-- 20260628000003_initiate_anonymous_chat_rpc.sql). Product intent:
-- blocking someone via an anonymous chat should only remove that chat and
-- the specific anonymous post that led to it -- any OTHER anonymous post
-- by that same person, from a different anonymous conversation, is
-- unrelated and must stay visible. A profile_only block (normal,
-- non-anonymous blocking) is unaffected by this change -- it still hides
-- all of the blocked person's non-anonymous posts, exactly as before.
--
-- FIX, FIRST ATTEMPT AND WHY IT DIDN'T WORK
--
-- The first version of this migration tried a direct JOIN from
-- posts_summary_view to public.chats to check "is this post the origin of
-- an anonymous chat between these two users". posts_summary_view is
-- security_invoker = true, so that JOIN runs under the CALLING user's own
-- RLS -- and Phase 1's restrictive policy on chats ("Block direct reads of
-- anonymous chats", USING (is_anonymous = false)) silently hides every
-- anonymous chats row from any ordinary authenticated query, including one
-- embedded inside another view. Verified: the JOIN always returned zero
-- rows for real users, so no anonymous post was ever hidden. Caught by
-- testing as the `authenticated` role rather than the Postgres superuser
-- (which bypasses RLS entirely and would have hidden the bug).
--
-- This is the exact same class of problem the Phase 1-4 migrations already
-- solved for is_chat_participant()/can_read_chat_message_directly()/
-- block_chat_partner(): a small SECURITY DEFINER function that explicitly
-- checks what it needs and returns only a boolean (never row data), so it
-- can safely read chats without the restrictive policy applying, without
-- exposing anything beyond a yes/no answer.
--
-- FIX
--
-- is_anonymous_chat_post_blocked(post_id, post_author_id) -- SECURITY
-- DEFINER, checks both block directions in one call: true if a
-- block_scope = 'anonymous_only' row exists between auth.uid() and
-- post_author_id (either direction) AND there's an anonymous chats row
-- with that exact post_id between those same two users. posts_summary_view
-- calls this instead of joining chats directly. profile_only branches are
-- completely unchanged.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP FUNCTION IF EXISTS public.is_anonymous_chat_post_blocked(uuid, uuid);
-- Then re-run 20260726000000_fix_anonymous_block_scope_leak.sql's
-- posts_summary_view block verbatim to restore the "hide every anonymous
-- post" behavior.
--
-- ============================================================
-- VERIFICATION
-- ============================================================
-- Verified against a real local Postgres instance, querying AS the
-- `authenticated` role (not superuser, so RLS is actually exercised):
--   * A blocks B via an anonymous chat started from post X -> post X is
--     hidden from A; a DIFFERENT, unrelated anonymous post Y by B (no chat
--     tied to it) remains visible to A; B's non-anonymous post Z stays
--     visible throughout.
--   * Reverse direction (B blocks A from that same chat) is symmetric.
--   * A direct profile_only block (normal, non-chat) still hides ALL of
--     the blocked user's non-anonymous posts and does not touch either of
--     their anonymous posts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_anonymous_chat_post_blocked(
  p_post_id uuid,
  p_post_author_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blocks b
    JOIN public.chats c
      ON c.post_id = p_post_id
     AND c.is_anonymous = true
     AND ((c.participant_1_id = b.blocker_id AND c.participant_2_id = b.blocked_id)
          OR (c.participant_2_id = b.blocker_id AND c.participant_1_id = b.blocked_id))
    WHERE b.block_scope = 'anonymous_only'
      AND (
        (b.blocker_id = auth.uid() AND b.blocked_id = p_post_author_id)
        OR (b.blocker_id = p_post_author_id AND b.blocked_id = auth.uid())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_anonymous_chat_post_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_anonymous_chat_post_blocked(uuid, uuid) TO authenticated;

CREATE OR REPLACE VIEW public.posts_summary_view AS
SELECT
    p.id                      AS post_id,

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
    --   profile_only: hides ALL of the author's non-anonymous posts (unchanged).
    --   anonymous_only: hides ONLY the specific anonymous post that started
    --   an anonymous chat between the viewer and this author (both
    --   directions), via is_anonymous_chat_post_blocked -- not every
    --   anonymous post they have.
    (
      EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE b.blocker_id = auth.uid()
          AND b.blocked_id = p.user_id
          AND b.block_scope = 'profile_only'
          AND p.is_anonymous IS NOT TRUE
      )
      OR (
        p.is_anonymous IS NOT TRUE
        AND EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = p.user_id
            AND b.blocked_id = auth.uid()
            AND b.block_scope = 'profile_only'
        )
      )
      OR (
        p.is_anonymous IS TRUE
        AND public.is_anonymous_chat_post_blocked(p.id, p.user_id)
      )
    ) AS is_author_blocked_by_viewer,

    CASE WHEN op.id IS NOT NULL THEN (
      EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE b.blocker_id = auth.uid()
          AND b.blocked_id = op.user_id
          AND b.block_scope = 'profile_only'
          AND op.is_anonymous IS NOT TRUE
      )
      OR (
        op.is_anonymous IS NOT TRUE
        AND EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = op.user_id
            AND b.blocked_id = auth.uid()
            AND b.block_scope = 'profile_only'
        )
      )
      OR (
        op.is_anonymous IS TRUE
        AND public.is_anonymous_chat_post_blocked(op.id, op.user_id)
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
