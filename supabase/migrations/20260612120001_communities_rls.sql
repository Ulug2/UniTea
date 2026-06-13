BEGIN;

-- ============================================================
-- Migration: University-scoped RLS for communities.
-- Depends on:
--   public.get_my_university_id()        (20260609120000)
--   public.get_my_is_admin()             (sql/rls_moderation_admin.sql)
--   public.get_community_university_id() (20260612120000)
-- ============================================================

-- ---------- communities ----------
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select communities in my university" ON public.communities;
CREATE POLICY "Select communities in my university"
  ON public.communities FOR SELECT
  USING (
    university_id = public.get_my_university_id()
    OR public.get_my_is_admin()
  );

DROP POLICY IF EXISTS "Insert own communities" ON public.communities;
CREATE POLICY "Insert own communities"
  ON public.communities FOR INSERT
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Update own communities" ON public.communities;
CREATE POLICY "Update own communities"
  ON public.communities FOR UPDATE
  USING (created_by = auth.uid() OR public.get_my_is_admin())
  WITH CHECK (created_by = auth.uid() OR public.get_my_is_admin());

DROP POLICY IF EXISTS "Delete own communities" ON public.communities;
CREATE POLICY "Delete own communities"
  ON public.communities FOR DELETE
  USING (created_by = auth.uid() OR public.get_my_is_admin());

-- ---------- community_members ----------
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select members in my university" ON public.community_members;
CREATE POLICY "Select members in my university"
  ON public.community_members FOR SELECT
  USING (
    public.get_community_university_id(community_id) = public.get_my_university_id()
    OR public.get_my_is_admin()
  );

DROP POLICY IF EXISTS "Join communities in my university" ON public.community_members;
CREATE POLICY "Join communities in my university"
  ON public.community_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.get_community_university_id(community_id) = public.get_my_university_id()
  );

DROP POLICY IF EXISTS "Leave own membership" ON public.community_members;
CREATE POLICY "Leave own membership"
  ON public.community_members FOR DELETE
  USING (user_id = auth.uid() OR public.get_my_is_admin());

-- ---------- posts: enforce community membership on insert ----------
-- Replaces the university migration's "Insert own posts" policy so a user
-- can only post into a community they have actually joined. Campus posts
-- (community_id IS NULL) are unaffected.
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
  );

COMMIT;
