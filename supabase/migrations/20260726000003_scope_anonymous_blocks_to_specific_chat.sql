-- ============================================================
-- Scope anonymous_only blocks to the specific chat that was blocked, not
-- to the (blocker, blocked) real-identity pair.
-- ============================================================
--
-- BUG REPORT
--
-- User B has two separate anonymous chats with the same real person A: one
-- started from A's post 1, one from A's post 2. B blocks A from the chat
-- started on post 1. Expected: only that chat and post 1 disappear from
-- B's side. Actual: BOTH chats and both posts disappeared.
--
-- ROOT CAUSE
--
-- blocks only ever recorded (blocker_id, blocked_id, block_scope) -- it has
-- no idea WHICH anonymous conversation triggered the block. So "B blocked
-- A, anonymous_only" is indistinguishable from "B blocked A via chat 1"
-- vs "via chat 2" -- every check that asks "is there an anonymous_only
-- block between B and A" matches both chats and both originating posts,
-- because there is only ever one block row per (blocker, blocked) pair to
-- begin with (blocks_blocker_blocked_scope_key enforced exactly one).
--
-- The previous migration (20260726000002) tried to narrow post-hiding by
-- matching "does this post's chat connect these two people", but that's
-- still pair-level matching -- it can't tell chat 1 and chat 2 apart when
-- both connect the same two real people, which is exactly this bug.
--
-- FIX
--
-- blocks gains related_chat_id, populated only for anonymous_only rows
-- (via block_chat_partner), referencing the exact chat that was blocked.
-- The old pair-level unique constraint is replaced with two narrower
-- rules: profile_only blocks stay unique per (blocker, blocked) pair,
-- exactly as before (unaffected -- a real-identity block is inherently
-- pair-level). anonymous_only blocks become unique per (blocker, blocked,
-- related_chat_id) -- so the same two real people can independently block
-- one anonymous conversation while a different one between them stays
-- completely untouched. Every place that checks anonymous_only scope now
-- also requires related_chat_id to match the specific chat/post in
-- question, instead of matching on real identity alone:
--   * is_anonymous_chat_post_blocked (posts_summary_view) -- now joins
--     blocks.related_chat_id -> chats.id -> chats.post_id, so it only
--     matches the post that actually started the blocked chat.
--   * chat_messages_view / user_chats_summary / chats_view -- their
--     anonymous_only branch now also requires b.related_chat_id = c.id.
--   * broadcast_anonymous_chat_message() -- already operates on one
--     specific NEW.chat_id; its check now also requires
--     b.related_chat_id = NEW.chat_id.
-- profile_only branches in all of the above are completely untouched.
--
-- No client-side changes needed: the client never learns the counterpart's
-- real id for an anonymous chat in the first place (chats_view/
-- user_chats_summary already null it out), so nothing on the client could
-- have applied per-chat vs per-pair scoping anyway -- the imprecision was
-- entirely server-side, and the fix is entirely server-side.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- ALTER TABLE public.blocks DROP COLUMN IF EXISTS related_chat_id;
-- DROP INDEX IF EXISTS blocks_profile_only_unique_idx;
-- DROP INDEX IF EXISTS blocks_anonymous_only_unique_idx;
-- ALTER TABLE public.blocks ADD CONSTRAINT blocks_blocker_blocked_scope_key UNIQUE (blocker_id, blocked_id, block_scope);
-- Then re-run 20260726000002_narrow_anonymous_block_to_originating_post.sql's
-- is_anonymous_chat_post_blocked + posts_summary_view verbatim, and
-- 20260726000000_fix_anonymous_block_scope_leak.sql's chat_messages_view /
-- user_chats_summary / broadcast_anonymous_chat_message verbatim, and
-- 20260726000001_fix_blocked_anonymous_chat_still_reachable.sql's
-- chats_view verbatim, and revert block_chat_partner to its
-- 20260726000000 form (drops related_chat_id usage).
--
-- ============================================================
-- VERIFICATION
-- ============================================================
-- Verified against a real local Postgres instance, querying as the
-- `authenticated` role:
--   * B has two separate anonymous chats with A: chat_1 (post 1), chat_2
--     (post 2). B blocks A via chat_1 only.
--   * Only chat_1 disappears from B's (and A's) chat list/reachability;
--     chat_2 remains fully visible and reachable to both.
--   * Only post 1 (chat_1's origin) disappears from B's feed; post 2
--     (chat_2's origin) remains visible.
--   * Blocking a second, different chat with the same person creates an
--     independent block row (previously a silent ON CONFLICT no-op) and
--     independently hides only that chat/post.
--   * Non-anonymous (profile_only) blocking is completely unaffected:
--     still exactly one block row per pair, still hides all of that
--     person's non-anonymous posts/chats, dedup via 23505 unchanged.
-- ============================================================

-- 1. Schema change: blocks remembers which chat an anonymous_only block came from.
ALTER TABLE public.blocks
  ADD COLUMN related_chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE;

ALTER TABLE public.blocks
  DROP CONSTRAINT IF EXISTS blocks_blocker_blocked_scope_key;

CREATE UNIQUE INDEX blocks_profile_only_unique_idx
  ON public.blocks (blocker_id, blocked_id, block_scope)
  WHERE block_scope = 'profile_only';

CREATE UNIQUE INDEX blocks_anonymous_only_unique_idx
  ON public.blocks (blocker_id, blocked_id, block_scope, related_chat_id)
  WHERE block_scope = 'anonymous_only';

-- 2. block_chat_partner: store which chat this anonymous block came from.
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

  INSERT INTO public.blocks (blocker_id, blocked_id, block_scope, related_chat_id)
  VALUES (v_caller_id, v_target_id, 'anonymous_only', p_chat_id)
  ON CONFLICT (blocker_id, blocked_id, block_scope, related_chat_id)
    WHERE block_scope = 'anonymous_only'
    DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.block_chat_partner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_chat_partner(uuid) TO authenticated;

-- 3. posts_summary_view's helper: match the specific chat, not the pair.
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
    JOIN public.chats c ON c.id = b.related_chat_id
    WHERE b.block_scope = 'anonymous_only'
      AND c.post_id = p_post_id
      AND (
        (b.blocker_id = auth.uid() AND b.blocked_id = p_post_author_id)
        OR (b.blocker_id = p_post_author_id AND b.blocked_id = auth.uid())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_anonymous_chat_post_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_anonymous_chat_post_blocked(uuid, uuid) TO authenticated;

-- 4. chat_messages_view: anonymous_only branch now matches this specific chat.
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
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
       OR (b.blocker_id = cm.user_id AND b.blocked_id = auth.uid()
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
  );

REVOKE ALL ON public.chat_messages_view FROM PUBLIC;
GRANT SELECT ON public.chat_messages_view TO authenticated;

-- 5. user_chats_summary: anonymous_only branch now matches this specific chat.
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
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
       OR (b.blocked_id = auth.uid()
           AND b.blocker_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END)
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
  );

REVOKE ALL ON public.user_chats_summary FROM PUBLIC;
GRANT SELECT ON public.user_chats_summary TO authenticated;

-- 6. chats_view: anonymous_only branch now matches this specific chat.
CREATE OR REPLACE VIEW public.chats_view
WITH (security_invoker = false) AS
SELECT
  c.id,
  c.post_id,
  c.created_at,
  c.last_message_at,
  c.is_anonymous,
  c.initiator_id,
  CASE
    WHEN c.is_anonymous AND c.participant_1_id <> auth.uid() THEN NULL
    ELSE c.participant_1_id
  END AS participant_1_id,
  CASE
    WHEN c.is_anonymous AND c.participant_2_id <> auth.uid() THEN NULL
    ELSE c.participant_2_id
  END AS participant_2_id
FROM public.chats c
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid()
           AND b.blocked_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END)
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
       OR (b.blocked_id = auth.uid()
           AND b.blocker_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END)
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
  );

REVOKE ALL ON public.chats_view FROM PUBLIC;
GRANT SELECT ON public.chats_view TO authenticated;

-- 7. broadcast_anonymous_chat_message: already scoped to one NEW.chat_id,
--    now also requires the block to be related to that exact chat.
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
    WHERE (b.blocker_id = v_recipient_id AND b.blocked_id = NEW.user_id
           AND b.block_scope = 'anonymous_only' AND b.related_chat_id = NEW.chat_id)
       OR (b.blocker_id = NEW.user_id AND b.blocked_id = v_recipient_id
           AND b.block_scope = 'anonymous_only' AND b.related_chat_id = NEW.chat_id)
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
