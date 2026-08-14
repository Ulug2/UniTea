-- Phase 3.1B: add community reporting support.
--
-- `reports` currently enforces exactly one of {post_id, comment_id} via
-- report_target_check. Community reports need a third target column, so
-- that constraint is widened to "at most one of {post_id, comment_id,
-- community_id} is populated" (a sum <= 1 check) instead of adding a third
-- nested OR branch.
--
-- This is deliberately "<= 1", not "= 1". Empirically verified (dry run
-- against the live database, rolled back) that the *current, already-
-- deployed* "= 1" constraint has a pre-existing bug independent of this
-- migration: reports.post_id/comment_id are ON DELETE SET NULL, and Postgres
-- enforces CHECK constraints on that SET NULL just like any other UPDATE —
-- so deleting a post or comment that has ever been reported currently fails
-- outright with a check-constraint violation, because the row would
-- momentarily have zero populated targets. "<= 1" preserves the real
-- invariant (a report can never target two things at once) while allowing
-- the zero-targets state a deletion produces, fixing that pre-existing bug
-- as a side effect and satisfying this phase's own requirement that
-- deleting a reported community must leave the report row intact with
-- community_id cleared to NULL, not fail or cascade-delete the report.
--
-- community_id is nullable and ON DELETE SET NULL (not CASCADE): if the
-- reported community is later deleted, the report row must survive as a
-- moderation record — only its target reference is cleared.
--
-- No RLS changes: the existing INSERT policies ("Allow insert for
-- authenticated" / "Users can insert own reports") only check
-- reporter_id = auth.uid() and never reference post_id/comment_id, so they
-- already cover community_id with no modification. Verified against the
-- live database, not the stale sql/mydb.sql snapshot.

ALTER TABLE public.reports
  ADD COLUMN community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL;

ALTER TABLE public.reports
  DROP CONSTRAINT report_target_check;

ALTER TABLE public.reports
  ADD CONSTRAINT report_target_check CHECK (
    (
      (post_id IS NOT NULL)::int +
      (comment_id IS NOT NULL)::int +
      (community_id IS NOT NULL)::int
    ) <= 1
  );
