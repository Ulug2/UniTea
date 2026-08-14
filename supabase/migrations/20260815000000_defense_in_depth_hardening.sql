-- ============================================================
-- Phase 8 — Defense-in-Depth & Audit-Completeness Hardening
-- ============================================================
-- Fixes the SQL-level findings from the Phase 6 audit that were explicitly
-- deferred out of Phase 7's scope. Each group below is independent; see the
-- Phase 8 report for the audit determination behind each one (including the
-- two groups deliberately left unchanged: compute_daily_stats and
-- reposted_from_post_id, both live-verified as not requiring a DB change).

-- ── GROUP 1 — user_activity_events: derive university_id server-side ──
-- Only trigger on this table today is the rate-limit guard; university_id
-- (NOT NULL) was previously fully client-supplied with only auth.uid() =
-- user_id enforced by RLS. Mirrors the established pattern (set_post_
-- university_id, set_community_university_id, set_launch_event_profile_
-- university_id, set_admin_action_log_university_id): unconditionally
-- overwrite whatever was supplied with the value from the submitter's own
-- profile. This is an integrity fix (a forged university_id was never
-- readable by the wrong university's admin, since Phase 1 already scopes
-- reads by the *stored* value) — it stops a user from polluting a foreign
-- university's own aggregate stats.
CREATE OR REPLACE FUNCTION public.set_user_activity_event_university_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT university_id INTO NEW.university_id
    FROM public.profiles
   WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_user_activity_event_university_id
  BEFORE INSERT ON public.user_activity_events
  FOR EACH ROW EXECUTE FUNCTION public.set_user_activity_event_university_id();


-- ── GROUP 2 (support) — admin_action_logs: allow self-recorded admin ──
-- ── inserts from the moderation dashboard's browser (anon-key + JWT) client ──
-- Every existing writer (ban-user, delete-post, matchmaking ops) uses the
-- service role, which bypasses RLS — admin_action_logs has never had an
-- INSERT policy for the authenticated role at all. The dashboard's report-
-- status action (added this phase) runs as the browser's own authenticated
-- client, not service role, so without this policy that insert would be
-- silently denied. Scoped to the caller logging themselves as the actor;
-- university_id is still unconditionally derived by the existing trigger
-- regardless of what (if anything) the caller supplies, so this cannot be
-- used to forge a foreign-university log entry.
CREATE POLICY "Admins can insert their own action logs"
  ON public.admin_action_logs FOR INSERT
  TO authenticated
  WITH CHECK (admin_id = auth.uid() AND public.get_my_is_admin());


-- ── GROUP 6 — revoke anon EXECUTE on SECURITY DEFINER functions that ──
-- ── never legitimately serve unauthenticated callers ──────────────────
-- Each of these already fails closed for anon internally (auth.uid() IS
-- NULL / get_my_is_admin() is false when there's no real session), so this
-- is defense-in-depth only — no legitimate authenticated behavior changes.
-- Matches the REVOKE ... FROM anon already applied to reset_matchmaking_event.
REVOKE EXECUTE ON FUNCTION public.initiate_anonymous_chat(uuid)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.block_chat_partner(uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_anonymous_chat(uuid)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_anonymous_chat_read(uuid)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_analytics_summary()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_stats_chart(integer)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_content_counts(integer)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_event_counts_period(integer)   FROM anon;


-- ── GROUP 9 — admin_action_logs.admin_id: fix NOT NULL / FK inconsistency ──
-- admin_id is NOT NULL but its FK is ON DELETE SET NULL — deleting an admin
-- account (delete_user_account() -> auth.users cascades to profiles ->
-- admin_action_logs) would attempt to null admin_id and hit the NOT NULL
-- constraint, blocking that admin from ever deleting their own account once
-- they have any logged action. Preserving audit history is preferred over
-- either destroying it or permanently blocking account deletion, so the fix
-- is to make admin_id nullable — consistent with how target_user_id (same
-- FK shape) already behaves, and with what the FK's own SET NULL action has
-- always implied. university_id (populated independently, at insert time,
-- by its own trigger) is unaffected — this does not touch the Phase 5
-- university-isolation model.
ALTER TABLE public.admin_action_logs ALTER COLUMN admin_id DROP NOT NULL;


-- ── GROUP 10 — dedupe verified-equivalent redundant RLS policies ──────
-- Confirmed identical predicates (auth.uid() = id / id = auth.uid(), and
-- auth.uid() = reporter_id / reporter_id = auth.uid()) accumulated across
-- earlier migrations. PostgreSQL ORs multiple permissive policies together,
-- so dropping the redundant ones changes nothing behaviorally — only one of
-- each set is kept.
DROP POLICY IF EXISTS "Allow update only by owner" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
-- kept: "Users can update own profile"

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.reports;
-- kept: "Users can insert own reports"
