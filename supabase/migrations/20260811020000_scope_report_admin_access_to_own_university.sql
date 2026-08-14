BEGIN;

-- ============================================================
-- Phase 2 — University-Isolated Admin System: Reports Isolation
--
-- Product decision: the moderation dashboard is university-specific.
-- An SDU admin must never be able to read/update an NU report, and
-- vice versa — enforced by RLS, not a dashboard filter.
--
-- reports has no university_id column of its own. Its university is
-- derived transitively through exactly one of three mutually exclusive
-- targets (enforced by the existing report_target_check <= 1 CHECK,
-- from 20260807000000_add_community_reporting.sql):
--   post_id      -> posts.university_id
--   comment_id   -> comments.post_id -> posts.university_id
--   community_id -> communities.university_id
--
-- get_report_university_id() below resolves whichever branch applies.
-- No university_id column was added to reports — the existing
-- relational model fully supports a resolver, so per the phase 2 spec
-- a schema redesign was not introduced.
--
-- ---- Deleted-target behavior (read this before touching the policies
-- below) ----
-- All three target FKs are ON DELETE SET NULL (reports_post_id_fkey,
-- reports_comment_id_fkey, reports_community_id_fkey — verified live),
-- and comments.post_id is ON DELETE CASCADE from posts. So once a
-- report's target is hard-deleted (delete-post / delete-comment Edge
-- Functions, or a community delete), the corresponding *_id column on
-- the report itself is nulled by Postgres — the report survives (by
-- design, so it stays visible as a moderation record) but the join
-- chain to a university is gone. There is no durable, independent
-- record of which university a deleted-target report belonged to.
--
-- get_report_university_id() is built from LEFT JOINs + COALESCE, so a
-- report whose target has been hard-deleted naturally resolves to
-- NULL. In the policies below, "get_my_is_admin() AND
-- get_report_university_id(id) = get_my_university_id()" evaluates to
-- NULL (not TRUE) whenever the resolver returns NULL, so a
-- deleted-target report becomes invisible to EVERY admin — including
-- the admin whose university it originally belonged to — rather than
-- falling back to visible-to-everyone. This is the explicit "fail
-- closed, not open" behavior required by this phase, and is a real,
-- deliberate behavior change from today (any admin can currently see
-- deleted-target reports, e.g. the dashboard's "Community: deleted"
-- display path) — documented here rather than silently introduced.
--
-- A soft-deleted comment (comments.is_deleted = true, row still
-- exists) is NOT affected by this limitation: the resolver is
-- SECURITY DEFINER and reads the comments table directly regardless of
-- is_deleted, so its post_id (and therefore university) still resolves
-- normally. Only a hard DELETE (which nulls the FK) breaks resolution.
--
-- If deleted-target reports need to remain reviewable by their
-- original university's admin, the correct future fix is a durable
-- university_id snapshot captured on the report row at INSERT time
-- (independent of later target deletion) — intentionally not
-- implemented in this phase per the explicit instruction not to
-- introduce a schema redesign without first proving it's necessary.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_report_university_id(p_report_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    post_target.university_id,
    comment_post_target.university_id,
    community_target.university_id
  )
  FROM public.reports r
  LEFT JOIN public.posts post_target
    ON post_target.id = r.post_id
  LEFT JOIN public.comments comment_target
    ON comment_target.id = r.comment_id
  LEFT JOIN public.posts comment_post_target
    ON comment_post_target.id = comment_target.post_id
  LEFT JOIN public.communities community_target
    ON community_target.id = r.community_id
  WHERE r.id = p_report_id;
$$;

-- ---------- reports: SELECT ----------
-- "Allow read only for reporter" (auth.uid() = reporter_id) is
-- untouched — a separate, non-admin concern.
DROP POLICY IF EXISTS "Admins can read all reports" ON public.reports;
CREATE POLICY "Admins can read all reports"
  ON public.reports FOR SELECT
  USING (
    public.get_my_is_admin()
    AND public.get_report_university_id(id) = public.get_my_university_id()
  );

-- ---------- reports: UPDATE ----------
-- Two functionally identical unscoped admin UPDATE policies existed
-- ("Admins can update reports" using get_my_is_admin(), and "Allow
-- update for admins" using an equivalent EXISTS-subquery admin check).
-- Collapsed into the single scoped policy below; the redundant
-- duplicate is dropped rather than also scoped, per the instruction not
-- to leave duplicate/contradictory admin policies behind.
DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;
DROP POLICY IF EXISTS "Allow update for admins" ON public.reports;
CREATE POLICY "Admins can update reports"
  ON public.reports FOR UPDATE
  USING (
    public.get_my_is_admin()
    AND public.get_report_university_id(id) = public.get_my_university_id()
  )
  WITH CHECK (
    public.get_my_is_admin()
    AND public.get_report_university_id(id) = public.get_my_university_id()
  );

-- INSERT policies ("Allow insert for authenticated" / "Users can
-- insert own reports") are untouched — reporter submission behavior
-- (Phase 3.1B community reporting included) is out of scope for this
-- phase and must not change.

COMMIT;
