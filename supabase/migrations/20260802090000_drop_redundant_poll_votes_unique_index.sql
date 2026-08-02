BEGIN;

-- ============================================================
-- Cleanup: production's `poll_votes` table turned out to already
-- have a unique index over (poll_id, user_id) — `uq_poll_votes_poll_user`
-- — that predates this migration and is not defined anywhere in
-- supabase/migrations/ (discovered by inspecting the live schema
-- after applying 20260801130000_poll_votes_user_poll_unique.sql;
-- it was presumably created out-of-band, e.g. via the SQL editor).
--
-- It enforces the exact same guarantee as the newly added,
-- migration-tracked `poll_votes_user_poll_unique (user_id, poll_id)`
-- — uniqueness of the same column pair, just declared in the other
-- column order, which does not change what it enforces. Keeping
-- both means every insert/delete on poll_votes maintains two
-- redundant btree indexes for no additional guarantee.
--
-- This drops the untracked one and keeps the tracked one so the
-- live schema matches what's in version control. Confirmed via
-- pg_constraint that `uq_poll_votes_poll_user` is a standalone
-- unique index, not a table constraint or an FK target — safe to
-- drop directly.
-- ============================================================

DROP INDEX IF EXISTS public.uq_poll_votes_poll_user;

COMMIT;
