BEGIN;

-- ============================================================
-- Step 2: University-scoped RLS policies.
--
-- Applies university isolation to posts, profiles, and chats.
-- Admins (is_admin = true) bypass university isolation globally
-- via get_my_is_admin().
--
-- Depends on:
--   - get_my_university_id()  (from Step 1 migration)
--   - get_my_is_admin()       (existing helper)
-- ============================================================

-- ===================
-- POSTS
-- ===================

DROP POLICY IF EXISTS "allow select for authenticated" ON public.posts;
DROP POLICY IF EXISTS "allow insert for authenticated" ON public.posts;
DROP POLICY IF EXISTS "Users can create reposts"       ON public.posts;
DROP POLICY IF EXISTS "Allow update only by owner"     ON public.posts;
DROP POLICY IF EXISTS "Allow delete only by owner"     ON public.posts;

CREATE POLICY "Select posts in my university"
  ON public.posts FOR SELECT
  USING (
    (is_deleted = false)
    AND (
      university_id = public.get_my_university_id()
      OR public.get_my_is_admin()
    )
  );

CREATE POLICY "Insert own posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id OR public.get_my_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.get_my_is_admin());

CREATE POLICY "Delete own posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id OR public.get_my_is_admin());

-- ===================
-- PROFILES
-- ===================

-- Drop the overly-permissive policies that allow ANY authenticated
-- user to read ANY profile (cross-university).
DROP POLICY IF EXISTS "Allow read for authenticated"   ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;

-- Same-university read (non-admin path)
CREATE POLICY "Read profiles in my university"
  ON public.profiles FOR SELECT
  USING (university_id = public.get_my_university_id());

-- "Users can read own profile"  (id = auth.uid())       — kept as-is
-- "Admins can read all profiles" (get_my_is_admin())     — kept as-is
-- "Allow insert for new users"  (auth.uid() = id)        — kept as-is
-- "Allow delete only by owner"  (auth.uid() = id)        — kept as-is
-- "Allow update only by owner"  (auth.uid() = id)        — kept as-is
-- "Users can update own profile" / "Users can update their own profile" — kept as-is

-- ===================
-- CHATS — same-university initiation
-- ===================

-- Replace the open INSERT policy with one that also requires
-- both participants to share a university.
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.chats;

CREATE POLICY "Insert chats within same university"
  ON public.chats FOR INSERT
  WITH CHECK (
    (auth.uid() IN (participant_1_id, participant_2_id))
    AND (
      (SELECT university_id FROM public.profiles WHERE id = participant_1_id)
      =
      (SELECT university_id FROM public.profiles WHERE id = participant_2_id)
    )
  );

-- SELECT, UPDATE, DELETE policies on chats remain unchanged:
--   "Users can view own chats"              — participant check
--   "Users can update chats they participate in" — participant check
--   "Users can delete chats they participate in" — participant check

COMMIT;
