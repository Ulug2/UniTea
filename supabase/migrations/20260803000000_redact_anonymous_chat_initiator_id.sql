-- ============================================================
-- Fix: anonymous chat identity leak via unredacted initiator_id
-- ============================================================
--
-- ROOT CAUSE
-- ----------
-- chats_view and user_chats_summary (Phase 1-4 anonymous chat anonymity
-- work, 20260724-20260726) correctly redact participant_1_id/
-- participant_2_id for the counterpart in an anonymous chat via
-- `CASE WHEN c.is_anonymous AND <col> <> auth.uid() THEN NULL ELSE <col> END`.
-- Both views select `c.initiator_id` with no such redaction.
--
-- initiate_anonymous_chat (20260628000003_initiate_anonymous_chat_rpc.sql)
-- always sets initiator_id = participant_1_id (the caller who starts the
-- conversation). For every anonymous chat, the non-initiating participant
-- (participant_2 — the anonymous post's real author) can therefore read
-- `initiator_id` directly off their own chats_view/user_chats_summary row
-- and recover the initiator's real UUID: the exact value that
-- participant_1_id was redacted to hide, exposed through an unguarded
-- sibling column in the same row. This is reachable via the same
-- GRANT SELECT ... TO authenticated endpoint the app's own client already
-- calls for every anonymous chat -- no exploit beyond a normal
-- authenticated read, and the value is already sitting in the app's own
-- client-side cache the moment either screen loads an anonymous chat.
--
-- chat_messages_view does NOT select initiator_id at all -- confirmed via
-- audit, no change needed there. No other SECURITY DEFINER function
-- touching anonymous chats (initiate_anonymous_chat, mark_anonymous_chat_read,
-- set_anonymous_chat_message_deletion, delete_anonymous_chat,
-- block_chat_partner, broadcast_anonymous_chat_message) returns or
-- broadcasts initiator_id to the client.
--
-- FIX
-- ---
-- Apply the identical redaction CASE already used for participant_1_id/
-- participant_2_id to initiator_id, in both views. For a non-anonymous
-- chat, is_anonymous is false so the CASE's first branch never fires --
-- initiator_id passes through completely unchanged, exactly as before this
-- migration (non-anonymous chats already show full identity by design; this
-- column is never even read by the client for them -- see below). For an
-- anonymous chat: the initiator (whose id equals initiator_id) keeps seeing
-- their own real value; the counterpart now sees NULL instead of the
-- initiator's real UUID.
--
-- The column itself (`chats.initiator_id`) and initiate_anonymous_chat's
-- INSERT logic are both untouched -- this migration only changes what two
-- read-only views expose, not how the identity is stored or how chats are
-- created.
--
-- CLIENT IMPACT: none. Confirmed via audit that the only client logic
-- reading `initiator_id` is getChatDisplayIdentity()
-- (src/features/chat/utils/getChatIdentity.ts):
--   `if (currentUserId === chat.initiator_id) return { displayName: "Them" }`
-- For the true initiator this still evaluates true (real value, unchanged).
-- For the non-initiator it already had to evaluate false to reach the
-- correct "Anonymous User #XXXX" branch -- `undefined-vs-currentUserId`
-- becomes `null-vs-currentUserId`, both false, same branch taken. The
-- alias-hash fallback in that same branch prefers chat.chat_id/chat.id
-- (always populated by both views) over `initiator_id`, so its use of
-- initiator_id as a last-resort seed is unreachable in every real call
-- site (chat/[id].tsx, chat.tsx) -- confirmed via grep, both call sites
-- always pass a row with chat_id/id set. Non-anonymous chats never read
-- this field at all (getChatDisplayIdentity returns early on
-- `!chat.is_anonymous`, before initiator_id is ever referenced).
--
-- ============================================================

CREATE OR REPLACE VIEW public.chats_view
WITH (security_invoker = false) AS
SELECT
  c.id,
  c.post_id,
  c.created_at,
  c.last_message_at,
  c.is_anonymous,
  CASE
    WHEN c.is_anonymous AND c.initiator_id <> auth.uid() THEN NULL
    ELSE c.initiator_id
  END AS initiator_id,
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
  CASE
    WHEN c.is_anonymous AND c.initiator_id <> auth.uid() THEN NULL
    ELSE c.initiator_id
  END AS initiator_id
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

-- ============================================================
-- VERIFICATION (run against a real local Postgres instance seeded with
-- `supabase db dump --linked` plus this migration, mirroring the same
-- method used to verify Phases 1-4)
-- ============================================================
-- With two anonymous-chat participants A (initiator) and B (post author):
--   * A's own chats_view/user_chats_summary row: initiator_id = A's real id
--     (unchanged from before this migration).
--   * B's own chats_view/user_chats_summary row: initiator_id = NULL
--     (previously: A's real id -- this is the fix).
--   * Non-anonymous chats, both sides: initiator_id unchanged (real value),
--     identical to pre-migration behavior.
--   * participant_1_id/participant_2_id redaction, the block filter, and
--     every other column: unchanged output, confirming this migration only
--     touches the initiator_id column.
-- ============================================================
