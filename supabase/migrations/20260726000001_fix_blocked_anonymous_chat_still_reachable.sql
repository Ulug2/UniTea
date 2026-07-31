-- ============================================================
-- Fix: a blocked chat stays reachable by direct chat_id even though it's
-- excluded from the chat list (P0 privacy/blocking-completeness report).
-- ============================================================
--
-- INVESTIGATION SUMMARY
--
-- The reported scenario ("blocking an anonymous chat partner makes the old
-- conversation disappear, and that disappearance itself lets the blocker
-- infer the partner's identity") was investigated but not reproduced: after
-- 20260726000000, blocking-via-anonymous-chat (anonymous_only scope) and
-- blocking-via-real-profile (profile_only scope) are fully separated and do
-- not cross-contaminate in either direction. A user blocking their own
-- anonymous chat partner only removes that specific chat from their own
-- list -- which reveals nothing they didn't already know (they performed
-- the block), and does not touch the partner's public content or reveal
-- anything to the partner. No identity-inference channel was found here.
--
-- What the investigation DID find, confirmed against a real Postgres
-- instance: blocking never deletes chats/chat_messages rows -- it only
-- excludes the chat from user_chats_summary (the list view) via a
-- scope-matched WHERE NOT EXISTS check added across the last few
-- migrations. That's already "hide, don't delete" and fully reversible on
-- unblock. But chats_view (used for a direct single-chat-by-id read --
-- chat/[id].tsx's initial load, reachable via a stale push notification, a
-- cached navigation state, or any deep link to that chat id) has no block
-- awareness at all, only a participant check. So a blocked chat -- either
-- anonymous or not, this gap isn't anonymity-specific -- stays fully
-- loadable by id even after being blocked, and neither the DB nor the
-- client stop new sends once it's open (confirmed: both the blocker and
-- the blocked party can still INSERT into chat_messages; the Phase 3
-- broadcast trigger and chat_messages_view's block filter mean nothing
-- actually gets delivered or displayed to either side, so no content or
-- identity leaks -- but the interaction is silently neutralized rather
-- than actually prevented, unlike blocked non-anonymous chats, which
-- reject the send attempt outright).
--
-- FIX
--
-- Add the exact same scope-matched block check user_chats_summary already
-- applies (anonymous_only for anonymous chats, profile_only for
-- non-anonymous ones, both directions) to chats_view, so a blocked chat is
-- unreachable by id through the same single rule everywhere -- not just
-- absent from the list. Once the read itself is cut off, chat/[id].tsx's
-- existing query naturally fails to load the chat (the same outcome any
-- other inaccessible/nonexistent chat id already produces today), so no
-- separate client-side send-guard is needed for this case.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- Re-run 20260724000000_anonymous_chat_backend_anonymity_phase1.sql's
-- view #1 (chats_view) block verbatim to restore the participant-only
-- check.
--
-- ============================================================
-- VERIFICATION
-- ============================================================
-- Verified against a real local Postgres instance:
--   * After A blocks B via block_chat_partner (anonymous_only), chats_view
--     no longer returns the chat for A by id (previously did).
--   * The underlying chats/chat_messages rows are untouched -- confirmed
--     still present via a direct table read as superuser -- so unblocking
--     (removing the blocks row) makes the chat reachable again.
--   * A direct (non-anonymous) profile_only block on a normal chat also
--     makes it unreachable by id, matching user_chats_summary's existing
--     list-level behavior -- previously this chat stayed reachable by id
--     despite being blocked, same class of gap, now closed consistently.
--   * An unrelated, non-blocked chat is unaffected.
-- ============================================================

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
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END)
       OR (b.blocked_id = auth.uid()
           AND b.blocker_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END)
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END)
  );

REVOKE ALL ON public.chats_view FROM PUBLIC;
GRANT SELECT ON public.chats_view TO authenticated;
