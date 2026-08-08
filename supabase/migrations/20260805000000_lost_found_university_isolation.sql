-- ============================================================
-- Phase 1 / Task 1 — Restrict Lost & Found posts by university
-- ============================================================
-- Root cause: the posts INSERT policy ("Insert own posts", added in
-- 20260612120001_communities_rls.sql) never validated university_id at
-- all. In the normal app flow this was masked — the client never sends
-- university_id (see supabase/functions/create-post/index.ts), and the
-- BEFORE INSERT trigger set_post_university_id() (20260609120000) fills
-- it from the author's own profile whenever the incoming value is NULL.
--
-- But that trigger only fills a NULL value — it never overrides a
-- non-null one. Any authenticated client that calls the Supabase REST
-- API directly (bypassing the app and the create-post Edge Function
-- entirely) can already set user_id = itself and university_id = any
-- other university's id, and the existing INSERT policy has nothing
-- that would reject it. That is the concrete "manually posting into
-- another university's Lost & Found" path this closes.
--
-- Fix: add a WITH CHECK condition to the same INSERT policy, scoped
-- specifically to post_type = 'lost_found', requiring university_id to
-- match the caller's own (get_my_university_id()). Campus feed and
-- community posts are untouched — the added clause short-circuits to
-- TRUE for any post_type other than 'lost_found' via the first branch
-- of the OR, so their existing insert behavior (and the pre-existing
-- community-membership check) is unchanged.
--
-- No trigger/Edge Function change needed: for legitimate inserts
-- (university_id omitted by the client), the trigger already fills it
-- from the author's profile BEFORE this RLS check runs (Postgres
-- evaluates BEFORE ROW triggers, then WITH CHECK, for the same
-- statement), so it always equals get_my_university_id() and the new
-- condition passes. For a forged non-null value, the trigger leaves it
-- untouched and the new condition now correctly rejects the insert.
--
-- No data migration needed: this only constrains future INSERTs.
-- Existing rows keep whatever university_id they already have, and
-- remain visible exactly as before via the existing SELECT policy
-- ("Select posts in my university"), which was not touched.
-- ============================================================

BEGIN;

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
    AND (
      post_type <> 'lost_found'
      OR university_id = public.get_my_university_id()
    )
  );

COMMIT;
