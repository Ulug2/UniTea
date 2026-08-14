BEGIN;

-- ============================================================
-- Phase 1 — University-Isolated Admin System: Core RLS
--
-- Product decision: an admin is an administrator only within their own
-- university. Being is_admin = true must never by itself grant access
-- to another university's resources. This migration applies the same
-- fix already shipped for communities/community_members
-- (20260811000000_scope_admin_community_bypass_to_own_university.sql)
-- to four more tables identified in the read-only security audit:
-- posts, profiles, user_activity_events, daily_stats_snapshots.
--
-- Verified against the LIVE database (not sql/mydb.sql or any stale
-- snapshot) immediately before writing this migration — see the exact
-- policy names/definitions below, each matching what pg_policies
-- reported live.
--
-- Explicitly NOT touched by this migration (deferred to later phases):
-- reports, admin_action_logs, launch_event_profiles,
-- launch_event_matches, launch_event_config, the moderation dashboard,
-- and every Edge Function (ban-user, unban-user, delete-post,
-- delete-comment, run-matchmaking, reset-matchmaking,
-- purge-matchmaking-demographics, compute-daily-stats) — none of those
-- read RLS policies, so this migration cannot fix them, and they are
-- out of scope for Phase 1 by design.
-- ============================================================

-- ---------- posts ----------

-- SELECT: previously "university_id = get_my_university_id() OR
-- get_my_is_admin()" — an unconditional cross-university bypass for any
-- admin (this is the exact policy the audit's live simulation used to
-- prove an SDU admin could read an NU post by ID). The desired admin
-- behavior ("admin may read posts in their own university") is already
-- fully satisfied by the existing university_id = get_my_university_id()
-- clause — an admin's own university read never needed the bypass in
-- the first place. So, same reasoning as the communities SELECT fix,
-- the OR term is dropped entirely rather than replaced with a redundant
-- "OR (get_my_is_admin() AND university_id = get_my_university_id())"
-- (which would be logically identical to the clause already there).
DROP POLICY IF EXISTS "Select posts in my university" ON public.posts;
CREATE POLICY "Select posts in my university"
  ON public.posts FOR SELECT
  USING (
    (is_deleted = false)
    AND (university_id = public.get_my_university_id())
  );

-- UPDATE: admin bypass now requires the post to be in the admin's own
-- university. The trailing WITH CHECK clause constraining university_id
-- to match the post author's own profile (added in
-- 20260805000003_strengthen_post_university_id_update_enforcement.sql)
-- is preserved byte-for-byte — this migration only narrows *who* may
-- take the admin branch, it does not touch that separate invariant.
DROP POLICY IF EXISTS "Update own posts" ON public.posts;
CREATE POLICY "Update own posts"
  ON public.posts FOR UPDATE
  USING (
    (auth.uid() = user_id)
    OR (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  )
  WITH CHECK (
    (
      (auth.uid() = user_id)
      OR (public.get_my_is_admin() AND university_id = public.get_my_university_id())
    )
    AND (
      university_id = (
        SELECT p.university_id FROM public.profiles p WHERE p.id = posts.user_id
      )
    )
  );

-- DELETE: same narrowing as UPDATE. Owner-delete behavior is untouched.
DROP POLICY IF EXISTS "Delete own posts" ON public.posts;
CREATE POLICY "Delete own posts"
  ON public.posts FOR DELETE
  USING (
    (auth.uid() = user_id)
    OR (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  );

-- ---------- profiles ----------

-- "Admins can read all profiles" was a second, unconditional SELECT
-- policy layered on top of "Read profiles in my university" (which
-- already grants every user, admin or not, their own university's
-- profiles). Scoping this policy to the admin's own university makes it
-- a logical subset of that other policy — kept as its own named policy
-- (rather than dropped, unlike posts SELECT above) per the explicit
-- product instruction for this table, so the admin-specific grant stays
-- self-documenting for future phases (e.g. if admin read privileges
-- ever need to diverge from the plain same-university read, such as
-- seeing banned/unlisted profiles within their own university).
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    public.get_my_is_admin() AND university_id = public.get_my_university_id()
  );

-- ---------- user_activity_events ----------

-- This was the *only* SELECT policy on the table (no normal-user read
-- policy exists — users can only INSERT their own events, never read
-- any). Scoping it is a meaningful restriction, not a redundant one:
-- before this, any admin could read every university's individual
-- per-user activity events; now only their own university's.
DROP POLICY IF EXISTS "Admins can read all events" ON public.user_activity_events;
CREATE POLICY "Admins can read all events"
  ON public.user_activity_events FOR SELECT
  USING (
    public.get_my_is_admin() AND university_id = public.get_my_university_id()
  );

-- ---------- daily_stats_snapshots ----------

-- Also the only SELECT policy on this table. Same fix.
DROP POLICY IF EXISTS "Admins can read snapshots" ON public.daily_stats_snapshots;
CREATE POLICY "Admins can read snapshots"
  ON public.daily_stats_snapshots FOR SELECT
  USING (
    public.get_my_is_admin() AND university_id = public.get_my_university_id()
  );

COMMIT;
