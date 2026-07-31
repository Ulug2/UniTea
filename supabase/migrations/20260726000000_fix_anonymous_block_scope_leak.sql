-- ============================================================
-- Fix: blocking an anonymous chat partner deanonymizes them via
-- the feed (P0 privacy regression introduced in this migration set).
-- ============================================================
--
-- ROOT CAUSE
--
-- block_chat_partner() (20260724000001, phase 2) always inserted the
-- blocks row with block_scope = 'profile_only', copying the scope the
-- pre-existing non-anonymous chat-blocking path had always used.
-- posts_summary_view (20260628000004, predates this migration set)
-- explicitly ties block_scope to content type: profile_only hides the
-- author's NON-anonymous posts, anonymous_only hides their anonymous
-- posts. So blocking an anonymous chat partner planted a profile_only
-- row, which made that person's real, public, non-anonymous posts
-- disappear from the blocker's feed on the very next load -- an
-- observable, timed link between "who I just chatted with anonymously"
-- and "whose public posts just vanished". This defeats the entire point
-- of the anonymous chat backend-anonymity work.
--
-- The reverse direction has the identical problem and predates all of
-- this migration set: posts_summary_view's "the author blocked me"
-- check ignores block_scope entirely, so if the anonymous partner blocks
-- the viewer (any scope, including the anonymous_only this fix
-- introduces), the viewer still loses sight of the author's public posts.
--
-- A naive fix (just switch block_chat_partner to anonymous_only) creates
-- a new regression: chat-hiding logic (isBlockedChat, selectMessages,
-- isBlockedDirectMessage, the phase 3 broadcast trigger, and phase 4's
-- user_chats_summary) all hardcode a check for block_scope = 'profile_only'
-- to decide whether to hide a chat/its messages. Switching the scope
-- without also updating those checks would mean the blocked anonymous
-- partner's chat/messages stop being hidden -- silently weakening
-- existing blocking functionality.
--
-- FIX (server side, this migration; client side in the same commit)
--
-- Apply one consistent rule everywhere block_scope is checked, matching
-- what posts_summary_view already does for posts: anonymous_only governs
-- anonymous content/context, profile_only governs non-anonymous
-- content/context. Concretely:
--
--   1. block_chat_partner(uuid) -- drops the p_scope parameter entirely
--      and always inserts anonymous_only. Also now rejects non-anonymous
--      chats outright (this RPC exists only to solve the "client doesn't
--      know the real id" problem for anonymous chats -- the non-anonymous
--      chat-blocking path already has a legitimate direct insert with the
--      real id and profile_only, untouched by this migration).
--   2. posts_summary_view -- the reverse ("author blocked viewer") check
--      becomes scope-matched instead of scope-blind, symmetric with the
--      existing forward check. Non-anonymous content behavior: unchanged
--      for profile_only blocks (still hides). Only change: an author's
--      OWN anonymous_only block choice is now actually honored in the
--      reverse direction instead of being silently widened to also hide
--      their non-anonymous posts.
--   3. chat_messages_view / user_chats_summary -- the block-hiding check
--      (both directions) is now anonymity-aware: for an anonymous chat,
--      match anonymous_only; for a non-anonymous chat, match profile_only
--      (byte-for-byte the same behavior non-anonymous chats had before).
--   4. broadcast_anonymous_chat_message() -- this trigger only ever runs
--      for anonymous chats (early-returns otherwise), so its block check
--      (both directions) simply switches from profile_only to
--      anonymous_only unconditionally.
--
-- what stays completely untouched: the non-anonymous chat-blocking direct
-- insert (chat/[id].tsx's non-anonymous branch, useBlockUser.ts, the
-- profile/post block UI) -- still profile_only, still hides that
-- person's public posts, exactly as before this migration.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP FUNCTION IF EXISTS public.block_chat_partner(uuid);
-- CREATE OR REPLACE FUNCTION public.block_chat_partner(p_chat_id uuid, p_scope text DEFAULT 'profile_only')
-- RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_caller_id uuid := auth.uid();
--   v_target_id uuid;
-- BEGIN
--   IF v_caller_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
--   IF p_scope NOT IN ('anonymous_only', 'profile_only') THEN RAISE EXCEPTION 'invalid block scope: %', p_scope; END IF;
--   SELECT CASE WHEN participant_1_id = v_caller_id THEN participant_2_id
--     WHEN participant_2_id = v_caller_id THEN participant_1_id ELSE NULL END
--   INTO v_target_id FROM public.chats WHERE id = p_chat_id;
--   IF v_target_id IS NULL THEN RAISE EXCEPTION 'chat not found or you are not a participant'; END IF;
--   INSERT INTO public.blocks (blocker_id, blocked_id, block_scope)
--   VALUES (v_caller_id, v_target_id, p_scope)
--   ON CONFLICT (blocker_id, blocked_id, block_scope) DO NOTHING;
-- END; $$;
-- REVOKE ALL ON FUNCTION public.block_chat_partner(uuid, text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.block_chat_partner(uuid, text) TO authenticated;
--
-- (posts_summary_view / chat_messages_view / user_chats_summary /
-- broadcast_anonymous_chat_message rollback: re-run, respectively,
-- 20260628000004_fix_block_filter_and_service_role_grant.sql,
-- 20260724000000_..._phase1.sql's view #2 block, and
-- 20260724000003_..._phase4_db.sql's view #1 block, and
-- 20260724000002_..._phase3.sql's function, verbatim.)
--
-- ============================================================
-- VERIFICATION
-- ============================================================
-- Verified against a real local Postgres instance (same methodology as
-- the rest of this migration set), seeding two users A/B with an
-- anonymous chat and each holding a non-anonymous public post:
--   * A calls block_chat_partner on the anonymous chat -> blocks row is
--     (A, B, anonymous_only). B's public post's is_author_blocked_by_viewer
--     for A is false (previously true/leaked). The anonymous chat is
--     hidden from A's user_chats_summary and B's messages no longer
--     broadcast/appear in chat_messages_view for A.
--   * Reverse: B calls block_chat_partner on the same chat -> (B, A,
--     anonymous_only). A's public post's is_author_blocked_by_viewer for
--     B is false. Chat hidden from B's side too.
--   * Calling block_chat_partner against a non-anonymous chat id is
--     rejected.
--   * A normal profile_only block (direct insert, unrelated to any chat)
--     still hides the blocked user's non-anonymous posts and is
--     completely unaffected by any of the above.
-- ============================================================

-- 1. block_chat_partner: always anonymous_only, reject non-anonymous chats.
DROP FUNCTION IF EXISTS public.block_chat_partner(uuid, text);

CREATE OR REPLACE FUNCTION public.block_chat_partner(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_id uuid;
  v_is_anonymous boolean;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT
    CASE
      WHEN participant_1_id = v_caller_id THEN participant_2_id
      WHEN participant_2_id = v_caller_id THEN participant_1_id
      ELSE NULL
    END,
    is_anonymous
  INTO v_target_id, v_is_anonymous
  FROM public.chats
  WHERE id = p_chat_id;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'chat not found or you are not a participant';
  END IF;

  IF v_is_anonymous IS NOT TRUE THEN
    RAISE EXCEPTION 'block_chat_partner is only valid for anonymous chats';
  END IF;

  INSERT INTO public.blocks (blocker_id, blocked_id, block_scope)
  VALUES (v_caller_id, v_target_id, 'anonymous_only')
  ON CONFLICT (blocker_id, blocked_id, block_scope) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.block_chat_partner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_chat_partner(uuid) TO authenticated;

-- 2. posts_summary_view: scope-match the reverse ("author blocked viewer") check.
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
    -- Both directions are now scope-matched to content type:
    --   anonymous_only blocks/is-blocked-by hide/are-hidden-from anonymous posts.
    --   profile_only blocks/is-blocked-by hide/are-hidden-from non-anonymous posts.
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
        EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = p.user_id
            AND b.blocked_id = auth.uid()
            AND (
              (b.block_scope = 'anonymous_only' AND p.is_anonymous IS TRUE)
              OR (b.block_scope = 'profile_only' AND p.is_anonymous IS NOT TRUE)
            )
        )
      )
    ) AS is_author_blocked_by_viewer,

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
        EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = op.user_id
            AND b.blocked_id = auth.uid()
            AND (
              (b.block_scope = 'anonymous_only' AND op.is_anonymous IS TRUE)
              OR (b.block_scope = 'profile_only' AND op.is_anonymous IS NOT TRUE)
            )
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

-- 3. chat_messages_view: anonymity-aware block check, both directions.
CREATE OR REPLACE VIEW public.chat_messages_view
WITH (security_invoker = false) AS
SELECT
  cm.id,
  cm.chat_id,
  CASE
    WHEN c.is_anonymous AND cm.user_id <> auth.uid() THEN NULL
    ELSE cm.user_id
  END AS user_id,
  cm.content,
  cm.is_read,
  cm.created_at,
  cm.deleted_by_sender,
  cm.deleted_by_receiver,
  cm.image_url,
  cm.reply_to_id,
  cm.image_aspect_ratio,
  CASE
    WHEN rm.id IS NULL THEN NULL
    ELSE jsonb_build_object(
      'id', rm.id,
      'content', rm.content,
      'image_url', rm.image_url,
      'user_id', CASE
        WHEN c.is_anonymous AND rm.user_id <> auth.uid() THEN NULL
        ELSE rm.user_id
      END
    )
  END AS reply_message
FROM public.chat_messages cm
JOIN public.chats c ON c.id = cm.chat_id
LEFT JOIN public.chat_messages rm ON rm.id = cm.reply_to_id AND rm.chat_id = cm.chat_id
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = cm.user_id
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END)
       OR (b.blocker_id = cm.user_id AND b.blocked_id = auth.uid()
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END)
  );

REVOKE ALL ON public.chat_messages_view FROM PUBLIC;
GRANT SELECT ON public.chat_messages_view TO authenticated;

-- 4. user_chats_summary: anonymity-aware block check, both directions.
CREATE OR REPLACE VIEW public.user_chats_summary
WITH (security_invoker = false) AS
SELECT
  c.id AS chat_id,
  CASE
    WHEN c.is_anonymous AND c.participant_1_id <> auth.uid() THEN NULL
    ELSE c.participant_1_id
  END AS participant_1_id,
  CASE
    WHEN c.is_anonymous AND c.participant_2_id <> auth.uid() THEN NULL
    ELSE c.participant_2_id
  END AS participant_2_id,
  c.post_id,
  c.created_at,
  c.last_message_at,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
         CASE WHEN cm.user_id = c.participant_1_id THEN 'You deleted this message' ELSE 'This message was deleted' END
       ELSE cm.content
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_content_p1,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
       ELSE cm.image_url IS NOT NULL AND cm.image_url <> ''
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_has_image_p1,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
         CASE WHEN cm.user_id = c.participant_2_id THEN 'You deleted this message' ELSE 'This message was deleted' END
       ELSE cm.content
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_content_p2,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
       ELSE cm.image_url IS NOT NULL AND cm.image_url <> ''
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_has_image_p2,
  (SELECT count(*) FROM public.chat_messages cm
   WHERE cm.chat_id = c.id AND cm.user_id = c.participant_2_id AND cm.is_read = false
     AND NOT COALESCE(cm.deleted_by_receiver, false)) AS unread_count_p1,
  (SELECT count(*) FROM public.chat_messages cm
   WHERE cm.chat_id = c.id AND cm.user_id = c.participant_1_id AND cm.is_read = false
     AND NOT COALESCE(cm.deleted_by_receiver, false)) AS unread_count_p2,
  c.is_anonymous,
  c.initiator_id
FROM public.chats c
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id)
  AND EXISTS (SELECT 1 FROM public.chat_messages cm WHERE cm.chat_id = c.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid()
           AND b.blocked_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END)
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END)
       OR (b.blocked_id = auth.uid()
           AND b.blocker_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END)
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END)
  );

REVOKE ALL ON public.user_chats_summary FROM PUBLIC;
GRANT SELECT ON public.user_chats_summary TO authenticated;

-- 5. broadcast_anonymous_chat_message: only ever runs for anonymous chats,
--    so its block check now matches anonymous_only unconditionally.
CREATE OR REPLACE FUNCTION public.broadcast_anonymous_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_anonymous boolean;
  v_recipient_id uuid;
BEGIN
  SELECT
    is_anonymous,
    CASE WHEN participant_1_id = NEW.user_id THEN participant_2_id ELSE participant_1_id END
  INTO v_is_anonymous, v_recipient_id
  FROM public.chats
  WHERE id = NEW.chat_id;

  IF v_is_anonymous IS NOT TRUE OR v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;

  IF EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = v_recipient_id AND b.blocked_id = NEW.user_id AND b.block_scope = 'anonymous_only')
       OR (b.blocker_id = NEW.user_id AND b.blocked_id = v_recipient_id AND b.block_scope = 'anonymous_only')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id', NEW.id,
      'chat_id', NEW.chat_id,
      'content', NEW.content,
      'image_url', NEW.image_url,
      'image_aspect_ratio', NEW.image_aspect_ratio,
      'created_at', NEW.created_at,
      'is_read', NEW.is_read,
      'reply_to_id', NEW.reply_to_id
    ),
    'new_message',
    'anon-chat-message:' || NEW.chat_id::text || ':' || v_recipient_id::text,
    true
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_anonymous_chat_message() FROM PUBLIC;
