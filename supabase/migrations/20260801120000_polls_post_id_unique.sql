BEGIN;

-- ============================================================
-- Post-creation idempotency (Phase 2): allow a client-generated
-- post id to double as an idempotency key. `posts.id` already
-- has a DEFAULT and accepts an explicit value on INSERT, so no
-- schema change is needed there. `polls.post_id` has no
-- uniqueness guarantee today, so a retried poll-post submission
-- could create a second `polls` row (and a second set of
-- `poll_options`) even once the `posts` row itself is
-- deduplicated. This adds that guarantee.
--
-- One poll per post is already an invariant enforced by
-- application code (create-post only ever inserts one polls row
-- per post_id) — this makes the database enforce it too, which
-- is what the create-post Edge Function's new conflict-fallback
-- logic (ON insert error 23505, fetch the existing poll) relies on.
-- ============================================================

-- Deduplicate any pre-existing double-submitted polls before adding
-- the constraint (keeps the earliest poll per post_id; cascades to
-- that poll's own poll_options/poll_votes via the existing
-- ON DELETE CASCADE FKs from migration 20260307000000).
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY post_id ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM public.polls
)
DELETE FROM public.polls
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.polls
  ADD CONSTRAINT polls_post_id_key UNIQUE (post_id);

COMMIT;
