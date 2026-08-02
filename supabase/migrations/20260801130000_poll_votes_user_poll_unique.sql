BEGIN;

-- ============================================================
-- Poll vote integrity (Phase 5): `poll_votes` has no unique
-- constraint today, and the client's vote-change flow was a
-- non-atomic DELETE-then-INSERT pair — an ambiguous network
-- failure, a retry, a fast double-tap, or the same account voting
-- from two devices could create more than one row for the same
-- (user, poll), corrupting the publicly displayed tally (poll
-- vote counts are computed dynamically, client-side, straight
-- from these rows — there is no stored/trigger-maintained count
-- to fall back on).
--
-- This mirrors `votes_user_post_unique` / `votes_user_comment_unique`
-- (20260628000000_security_fixes.sql), which already exists for
-- post/comment votes for the identical reason.
--
-- Scope: one vote per user per poll (single-choice), matching the
-- app's current behavior — the UI does not yet implement
-- `allow_multiple`. If multi-select polls are ever implemented,
-- this constraint would need to become (user_id, poll_id, option_id)
-- instead; not done here since nothing in the app relies on it today.
-- ============================================================

-- Deduplicate any pre-existing double votes before adding the
-- constraint (a unique index cannot be created over existing
-- violations). Keeps the earliest vote per (user_id, poll_id) —
-- i.e. whichever option the user picked first — and removes the
-- rest. poll_votes has no dependent rows (no FKs reference it), so
-- this is a plain, self-contained delete.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, poll_id ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM public.poll_votes
)
DELETE FROM public.poll_votes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_user_poll_unique
  ON public.poll_votes(user_id, poll_id);

COMMIT;
