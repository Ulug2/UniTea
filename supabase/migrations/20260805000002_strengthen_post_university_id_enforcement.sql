-- ============================================================
-- Phase 1 (follow-up) / Task 2 — Close university_id spoofing for
-- ALL post types (Campus, Community, Lost & Found)
-- ============================================================
-- Supersedes the lost_found-only WITH CHECK clause added in
-- 20260805000000_lost_found_university_isolation.sql with a general
-- one that applies to every post, and closes the gap at its actual
-- root cause: set_post_university_id() only ever filled a NULL
-- university_id, so a client-supplied non-null value (forged via a
-- direct Supabase REST call, bypassing the app and the create-post
-- Edge Function — the Edge Function itself never sends this field)
-- passed straight through untouched for Campus and Community posts.
--
-- Two layers, both required (per explicit instruction not to let the
-- trigger be the sole boundary):
--
-- 1. TRIGGER (single source of truth): set_post_university_id() now
--    unconditionally derives university_id from the author's own
--    profile on every insert — auth.uid()/NEW.user_id ->
--    profiles.university_id -> NEW.university_id — instead of only
--    filling a NULL. A client-supplied value, forged or not, is now
--    always discarded and replaced. This is a BEFORE INSERT trigger,
--    so it runs before RLS WITH CHECK is evaluated for the same
--    statement.
--
-- 2. RLS (independent backstop): the "Insert own posts" policy's
--    WITH CHECK now requires university_id = get_my_university_id()
--    for every post, not just lost_found ones. Because of (1), this
--    can never actually fail for a legitimate insert (the trigger
--    already forced the row into a state that satisfies it) — its
--    purpose is to independently guarantee the invariant even if the
--    trigger were ever altered, disabled, or bypassed, rather than
--    relying on trigger behavior alone.
--
-- Unaffected by design:
--   - Community membership check (unchanged, still required for
--     community_id IS NOT NULL posts).
--   - post_type-specific fields (category/location for lost_found,
--     poll_options for feed) — untouched.
--   - is_anonymous — untouched; anonymity is a display concern
--     layered on top of a real, still-attributed user_id/university_id,
--     not something this policy touches.
--   - SELECT/UPDATE/DELETE policies on posts — untouched. Existing
--     rows are unaffected; this only constrains future INSERTs.
--   - Admins get no special bypass here, matching the pre-existing
--     "Insert own posts" policy, which never had an is_admin() OR
--     clause — an admin's own posts are still scoped to their own
--     university like anyone else's; is_admin() bypass only applies
--     to reading/moderating, never to insert.
-- ============================================================

BEGIN;

-- 1. Trigger: always derive university_id, never trust the incoming value.
CREATE OR REPLACE FUNCTION public.set_post_university_id()
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
-- Trigger attachment (trg_set_post_university_id, BEFORE INSERT) is
-- unchanged — it already references this function by name, so
-- CREATE OR REPLACE above is sufficient; no need to re-create it.

-- 2. RLS: independent backstop, now unconditional (all post types).
DROP POLICY IF EXISTS "Insert own posts" ON public.posts;

CREATE POLICY "Insert own posts"
  ON public.posts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      community_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.community_members m
        WHERE m.community_id = posts.community_id
          AND m.user_id = auth.uid()
      )
    )
    AND university_id = public.get_my_university_id()
  );

COMMIT;
