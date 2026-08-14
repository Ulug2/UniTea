BEGIN;

-- ============================================================
-- Fix: admin RLS bypass on communities/community_members was
-- global (any university), not scoped to the admin's own
-- university.
--
-- 20260612120001_communities_rls.sql added `OR get_my_is_admin()`
-- to the communities SELECT/UPDATE/DELETE and community_members
-- SELECT/DELETE policies. get_my_is_admin() only checks
-- profiles.is_admin — it has no university awareness — so any
-- admin (e.g. the SDU admin account) could read, update, or
-- delete ANY university's communities/memberships, not just
-- their own. Confirmed live: an SDU admin navigating directly to
-- an NU community's id (e.g. /communities/<nu-id>/manage) would
-- pass RLS purely on is_admin, with no university check at all.
--
-- Fix: scope the admin bypass to rows in the admin's own
-- university, using the exact same get_my_university_id() /
-- get_community_university_id() helpers the non-admin clauses
-- already use. This is not a broader admin bypass than before —
-- it is strictly narrower (was: any university; now: own
-- university only) — so it cannot introduce new access.
--
-- SELECT policies: once scoped, `get_my_is_admin() AND
-- university_id = get_my_university_id()` is logically identical
-- to the existing non-admin clause (both reduce to "does this
-- row's university match my own"), so the OR term is dropped
-- entirely rather than kept as dead-but-harmless duplication.
--
-- UPDATE/DELETE policies: the admin bypass is NOT redundant there
-- (it legitimately extends management beyond rows the admin
-- personally created), so it is kept, but scoped to same-
-- university rows only.
-- ============================================================

-- ---------- communities ----------

DROP POLICY IF EXISTS "Select communities in my university" ON public.communities;
CREATE POLICY "Select communities in my university"
  ON public.communities FOR SELECT
  USING (
    university_id = public.get_my_university_id()
  );

DROP POLICY IF EXISTS "Update own communities" ON public.communities;
CREATE POLICY "Update own communities"
  ON public.communities FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  );

DROP POLICY IF EXISTS "Delete own communities" ON public.communities;
CREATE POLICY "Delete own communities"
  ON public.communities FOR DELETE
  USING (
    created_by = auth.uid()
    OR (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  );

-- ---------- community_members ----------

DROP POLICY IF EXISTS "Select members in my university" ON public.community_members;
CREATE POLICY "Select members in my university"
  ON public.community_members FOR SELECT
  USING (
    public.get_community_university_id(community_id) = public.get_my_university_id()
  );

DROP POLICY IF EXISTS "Leave own membership" ON public.community_members;
CREATE POLICY "Leave own membership"
  ON public.community_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (
      public.get_my_is_admin()
      AND public.get_community_university_id(community_id) = public.get_my_university_id()
    )
  );

COMMIT;
