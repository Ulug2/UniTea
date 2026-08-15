BEGIN;

-- ============================================================
-- user_activity_events: add a (university_id, occurred_at DESC)
-- composite index
-- ============================================================
--
-- Existing indexes on this table: user_activity_events_pkey (id),
-- idx_activity_events_occurred_at (occurred_at DESC), and
-- idx_activity_events_user_date (user_id, occurred_at DESC). None
-- cover a university_id equality filter combined with an occurred_at
-- range — the exact pattern used throughout:
--   * the admin RLS SELECT policy ("Admins can read all events"),
--     filtered on university_id = get_my_university_id();
--   * every per-university analytics RPC in
--     20260627000000_analytics_v3_et_event_based.sql and
--     20260814000000_university_scope_content_analytics_and_anon_chat.sql
--     (DAU/WAU/MAU, content counts), each filtering
--     `WHERE occurred_at >= ... AND university_id = v_university_id`.
--
-- Without this index those queries fall back to either a full scan or
-- the occurred_at-only index followed by a filter on university_id.
-- Confirmed no equivalent index already exists (by name or by column
-- set) before adding this one.
--
-- Table is small today (~700 rows) so this is a fast, uncontended
-- CREATE INDEX; no CONCURRENTLY needed, and this project's migrations
-- are applied inside a BEGIN/COMMIT transaction (see every other file
-- in this directory), which CREATE INDEX CONCURRENTLY cannot run
-- inside anyway.
-- ============================================================

CREATE INDEX idx_activity_events_university_date
  ON public.user_activity_events (university_id, occurred_at DESC);

COMMIT;
