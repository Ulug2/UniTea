BEGIN;

-- ============================================================
-- Phase 6, Step 2 corrective fix: align SELECT policies with the
-- owner_id model
-- ============================================================
--
-- BUG FOUND DURING STEP 2 VERIFICATION
--
-- 20260802100000_storage_rls_ownership_hardening.sql added correct
-- owner_id-based INSERT/UPDATE/DELETE policies, but left the three
-- pre-existing SELECT policies ("Users list own {bucket} folder") as
-- they were: folder-based, (storage.foldername(name))[1] = auth.uid().
--
-- Verified directly against production (transaction-scoped, always
-- ROLLBACK'd, no data touched): Postgres RLS requires a row to be
-- visible under the table's SELECT policy before an UPDATE or DELETE
-- policy can match it at all -- the write policy's own USING clause is
-- necessary but not sufficient. Since avatars (0/38 objects),
-- chat-images (0/69), and most post-images (122/128, the
-- community-image uploads) have no folder segment in their path, the
-- folder-based SELECT policy fails for them -- which silently blocked
-- UPDATE/DELETE for the rightful owner too, not just for other users:
--
--   * avatar replacement's old-file cleanup (useAvatarUpload.ts) --
--     always a no-op post-migration, failing non-fatally and silently.
--   * chat "delete for everyone" image cleanup
--     (useChatMessageActions.ts) -- still broken (was broken before for
--     a different reason: no DELETE policy existed at all; now broken
--     because the policy exists but is unreachable).
--   * only post-images objects under a real {userId}/... folder
--     (regular posts/Lost & Found) were unaffected.
--
-- FIX
--
-- Replace the three folder-based SELECT policies with the same
-- owner_id = auth.uid() model already used for INSERT/UPDATE/DELETE.
-- This is the correct signal regardless of path shape (see the Step 1
-- migration's own reasoning) and requires no application-code or path
-- changes. It also means only an object's own uploader can query its
-- storage.objects row directly going forward -- this does not affect
-- how images are displayed anywhere in the app: avatars/post-images/
-- chat-images are all Storage-public buckets, and every render path
-- (SupabaseImage.tsx, ResponsiveImage.tsx) resolves images via the
-- public URL, which bypasses SELECT RLS entirely. No code in this
-- repo queries storage.objects directly for display.
-- ============================================================

DROP POLICY IF EXISTS "Users list own avatar folder"       ON storage.objects;
DROP POLICY IF EXISTS "Users list own post-images folder"  ON storage.objects;
DROP POLICY IF EXISTS "Users list own chat-images folder"  ON storage.objects;

CREATE POLICY "Owner can view own avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can view own post-images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'post-images' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can view own chat-images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-images' AND owner_id = (auth.uid())::text);

COMMIT;
