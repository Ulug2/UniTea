-- ============================================================
-- Phase 5 — University-Isolated Admin Action Logs
-- ============================================================
-- Audit findings (see Phase 5 report):
--   - admin_action_logs had no university_id column and exactly one RLS
--     policy: "Admins can read action logs" USING (EXISTS (... is_admin =
--     true)) — any admin, from any university, could read every log row.
--   - admin_id is NOT NULL and FK-enforced to an existing profiles row on
--     every existing write path (ban-user, unban-user, delete-post,
--     run-matchmaking, reset-matchmaking, purge-matchmaking-demographics,
--     reset_matchmaking_event) — there is no system/platform-wide writer
--     and no path that creates a log without a real authenticated admin.
--   - profiles.university_id is itself NOT NULL, so every admin_id
--     resolves to exactly one university.
--   - Live check of all 149 existing rows: 0 with NULL admin_id, 0 with an
--     admin_id that doesn't resolve to a profiles row, 0 whose resolved
--     profile has a NULL university_id. Backfilling university_id from
--     admin_id -> profiles.university_id is therefore unambiguous for
--     every existing row (not a fabrication).
--   - No UPDATE/DELETE RLS policies exist today (logs are correctly
--     append-only); this migration does not add any.
--   - No authenticated-role INSERT policy exists today either — every
--     current writer uses the service-role key from an Edge Function or a
--     SECURITY DEFINER RPC, both of which bypass RLS but NOT triggers.

-- ── 1. Add university_id, backfilled from the historical actor's own
--       university at time-of-insert semantics (resolved once now, then
--       fixed at insert time going forward by the trigger below) ──
ALTER TABLE public.admin_action_logs
  ADD COLUMN university_id uuid REFERENCES public.universities(id);

UPDATE public.admin_action_logs l
   SET university_id = p.university_id
  FROM public.profiles p
 WHERE p.id = l.admin_id;

-- Safe per the audit above: every existing row resolved with zero
-- ambiguity, so NOT NULL is not a fail-open compromise here.
ALTER TABLE public.admin_action_logs ALTER COLUMN university_id SET NOT NULL;

CREATE INDEX admin_action_logs_university_id_idx ON public.admin_action_logs (university_id);

-- ── 2. Derive university_id server-side on every future insert ──
-- Mirrors set_post_university_id() / set_launch_event_profile_university_id():
-- a BEFORE INSERT trigger unconditionally overwrites whatever value (if
-- any) was supplied with the value from the acting admin's own profile.
-- This is the single point of enforcement for ALL current and future
-- writers (ban-user, unban-user, delete-post, delete-comment,
-- run-matchmaking, reset-matchmaking, purge-matchmaking-demographics,
-- reset_matchmaking_event, and anything written later) without requiring
-- any of them to be modified — none of them need to change to safely
-- populate this column, and none can forge a foreign university_id even
-- though they run under the service role (triggers still fire; only RLS
-- is bypassed by the service role, not trigger enforcement).
CREATE OR REPLACE FUNCTION public.set_admin_action_log_university_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT university_id INTO NEW.university_id
    FROM public.profiles
   WHERE id = NEW.admin_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_admin_action_log_university_id
  BEFORE INSERT ON public.admin_action_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_admin_action_log_university_id();

-- ── 3. Scope SELECT to the admin's own university ──
-- Explicitly drop the old unscoped policy first — PostgreSQL combines
-- multiple permissive policies with OR, so leaving it in place would
-- silently defeat the new scoped policy below.
DROP POLICY IF EXISTS "Admins can read action logs" ON public.admin_action_logs;

CREATE POLICY "Admins can read action logs"
  ON public.admin_action_logs FOR SELECT
  USING (public.get_my_is_admin() AND university_id = public.get_my_university_id());

-- No INSERT/UPDATE/DELETE policy is added: INSERT is handled entirely by
-- the trigger above (all current writers use the service role, which
-- bypasses RLS but not the trigger); UPDATE/DELETE remain unreachable for
-- every role, preserving the existing append-only behavior.
