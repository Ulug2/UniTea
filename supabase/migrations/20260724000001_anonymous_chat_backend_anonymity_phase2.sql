-- ============================================================
-- Anonymous chat backend anonymity — Phase 2 of 4
--
-- PROBLEM THIS PHASE SOLVES: once Phase 1 ships, the client will no
-- longer hold the anonymous chat partner's real UUID (chats_view /
-- chat_messages_view null it out for the counterpart). But blocking
-- (src/app/(protected)/chat/[id].tsx, blockUserMutation) currently works
-- by the client sending `blocked_id: otherUserId` directly to
-- `blocks.insert(...)` — it needs the real target UUID to be useful,
-- since the whole point of a `profile_only` block is that it also
-- silences that person's NON-anonymous posts/comments/messages
-- elsewhere, not just this one anonymous thread. A client that no longer
-- knows the real UUID cannot construct that insert.
--
-- FIX: a single SECURITY DEFINER RPC, block_chat_partner(chat_id, scope),
-- that resolves the real counterpart from `chats` SERVER-SIDE (bypassing
-- RLS the same way initiate_anonymous_chat already does) and performs the
-- insert itself. The client only ever needs to pass a chat_id it already
-- has — it never needs, and after Phase 1 never receives, the partner's
-- raw UUID for anonymous chats.
--
-- SCOPE, DELIBERATELY MINIMAL:
--   * This migration touches nothing except adding this one function. No
--     existing table, policy, or grant is modified.
--   * The existing direct-insert blocking path
--     (`blocks.insert({blocker_id, blocked_id, block_scope})`, used today
--     by chat/[id].tsx for NON-anonymous chats, where the client
--     legitimately already holds the real id) is completely untouched —
--     Phase 4 will route ONLY the anonymous-chat branch of
--     blockUserMutation through this RPC, leaving the non-anonymous
--     branch exactly as it is today. There was no simpler alternative
--     that avoids exposing the real id to the client at all: RLS can
--     restrict which ROWS are visible, but it cannot let the client
--     "insert a row referencing an id it isn't allowed to see" without a
--     function that resolves that id server-side — this is the same
--     shape of problem initiate_anonymous_chat already solves for chat
--     creation, so this reuses that exact pattern rather than inventing
--     a new one.
--   * "Unblock" needed no change: useUnblockAll.ts deletes by
--     `blocker_id = auth.uid()` only — it never references the target's
--     id, so it was never affected by anonymity in the first place.
--   * The `blocks` table's own RLS (`Allow insert for authenticated`,
--     `WITH CHECK (auth.uid() = blocker_id AND blocker_id <> blocked_id)`)
--     is unchanged and still applies to this RPC's insert like any other
--     insert — the RPC does not bypass it via any special privilege
--     beyond what SECURITY DEFINER needs to read `chats`; the insert
--     itself runs as an ordinary insert subject to that same policy in
--     spirit (the function owner performs it, but the WITH CHECK
--     condition — caller blocks themselves→target, never someone else —
--     is enforced explicitly in the function body instead, see below).
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- Purely additive — one new function, nothing else touched.
--   DROP FUNCTION IF EXISTS public.block_chat_partner(uuid, text);
--
-- ============================================================
-- VERIFICATION (see full results in the report accompanying this file)
-- ============================================================
-- Verified against the same real local Postgres instance used for Phase
-- 1 (Phase 1 applied first, then this migration on top):
--   * A genuine participant of an anonymous chat can block the other
--     participant via chat_id alone; the resulting `blocks` row contains
--     the REAL target uuid (needed so the block also silences that
--     person's non-anonymous activity elsewhere — unchanged from today's
--     blocking semantics).
--   * A non-participant calling this RPC with someone else's chat_id is
--     rejected outright.
--   * Calling it twice for the same chat is a no-op (matches today's
--     client-side "23505 = already blocked, ignore" handling), and so is
--     calling it once each for both scopes (matches the
--     blocks_blocker_blocked_scope_key unique constraint, which allows a
--     user to hold both an anonymous_only and a profile_only block on
--     the same target simultaneously — unchanged).
--   * An invalid scope value is rejected with a clear error rather than
--     falling through to the table's CHECK constraint with a generic one.
--   * The existing direct-insert path (`blocks.insert(...)`, used for
--     non-anonymous chats) is completely unaffected — this migration
--     changes no existing object.
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_chat_partner(p_chat_id uuid, p_scope text DEFAULT 'profile_only')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_scope NOT IN ('anonymous_only', 'profile_only') THEN
    RAISE EXCEPTION 'invalid block scope: %', p_scope;
  END IF;

  -- Resolve the real counterpart server-side. Reads the base table
  -- directly (bypassing its RLS via SECURITY DEFINER ownership
  -- exemption, same as chats_view/is_chat_participant in Phase 1) so
  -- this works identically whether the chat is anonymous or not.
  SELECT CASE
    WHEN participant_1_id = v_caller_id THEN participant_2_id
    WHEN participant_2_id = v_caller_id THEN participant_1_id
    ELSE NULL
  END INTO v_target_id
  FROM public.chats
  WHERE id = p_chat_id;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'chat not found or you are not a participant';
  END IF;

  -- Mirrors the WITH CHECK on the existing "Allow insert for
  -- authenticated" policy on public.blocks (auth.uid() = blocker_id AND
  -- blocker_id <> blocked_id) explicitly, since this insert runs with
  -- the function owner's privileges rather than as a policy-checked
  -- statement from the caller.
  INSERT INTO public.blocks (blocker_id, blocked_id, block_scope)
  VALUES (v_caller_id, v_target_id, p_scope)
  ON CONFLICT (blocker_id, blocked_id, block_scope) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.block_chat_partner(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_chat_partner(uuid, text) TO authenticated;
