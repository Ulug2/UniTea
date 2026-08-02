BEGIN;

-- ============================================================
-- Phase 6.1: Storage RLS Security Hardening
-- ============================================================
--
-- CONTEXT
--
-- storage.objects' INSERT/UPDATE/DELETE policies today are bucket-wide
-- for the `authenticated` role, not owner-scoped:
--   * avatars:      any authenticated user can INSERT/UPDATE/DELETE any
--                    object in this bucket. Folder-scoped sibling
--                    policies ("Users can {upload,update,delete} their
--                    own avatars") also exist, but Postgres RLS ORs
--                    multiple permissive policies for the same command
--                    together -- since the unconditional sibling always
--                    passes, the folder-scoped one is dead code today
--                    and enforces nothing.
--   * post-images:   INSERT/UPDATE/DELETE are unconditionally open to
--                    any authenticated user (Dashboard-auto-generated
--                    "Full access to authenticated users 1hys5dx_*"
--                    policies) -- no ownership check exists at all, not
--                    even a dead one.
--   * chat-images:   INSERT is unconditionally open; UPDATE and DELETE
--                    have NO policy at all. RLS is confirmed enabled on
--                    storage.objects (pg_class.relrowsecurity = true),
--                    so "no matching policy" means deny for everyone,
--                    including a message's own sender -- almost
--                    certainly why useChatMessageActions.ts's
--                    "delete for everyone" image cleanup
--                    (`storage.remove([imageUrl])`) has been silently
--                    failing in production (the call is wrapped in a
--                    non-fatal catch that only logger.warn()s).
--
-- Net effect before this migration: any authenticated user could
-- overwrite or delete any other user's avatar, or any post/community
-- image, via a direct Storage API call, entirely independent of this
-- app's own UI. A real, live authorization gap, not a hypothetical.
--
-- WHY OWNERSHIP IS VERIFIED VIA owner_id, NOT FOLDER PATH
--
-- Folder-based ownership ((storage.foldername(name))[1] = auth.uid())
-- is the eventual target (see the storage-reliability investigation's
-- "future intended paths": avatars/{userId}/...,
-- post-images/{userId}/{postId}/...) but is not usable yet without also
-- changing uploadImage() and every call site's folder argument, which
-- this phase explicitly excludes. Verified directly against production
-- data before writing this migration:
--
--   bucket        | total | owner_id populated | has folder segment
--   avatars       |    38 |    38 (100%)        |   0
--   chat-images   |    69 |    69 (100%)        |   0
--   post-images   |   128 |   128 (100%)        |   6
--
-- Zero avatar or chat-image objects, and 122 of 128 post-images objects
-- (community images, uploaded via communities/create.tsx and
-- communities/[id]/manage.tsx with no folder argument), have any folder
-- segment at all. A folder-based policy would reject INSERT for every
-- avatar/chat-image/community-image upload today, and would leave 122
-- existing post-images objects permanently un-deletable/un-updatable by
-- their own rightful owner.
--
-- storage.objects.owner_id (text) is populated by the Supabase Storage
-- service itself from the caller's verified JWT at upload time --
-- confirmed 100% populated across all three buckets above, independent
-- of path/folder shape, and not something an end client can spoof (the
-- value is set server-side by the Storage service, not supplied by the
-- uploading client's request body). This makes it the correct ownership
-- signal to enforce today for INSERT/UPDATE/DELETE, with zero change to
-- uploadImage() or any call site.
--
-- Forward-compatible with the eventual deterministic-path work: once
-- paths become {userId}/... / {userId}/{postId}/..., these same
-- owner_id-based policies keep working unchanged -- a future phase can
-- layer an additional folder-based check on top as defense-in-depth if
-- desired, but owner_id alone already fully closes the gap this
-- migration addresses.
--
-- WHY chat-images GETS AN UPDATE POLICY NOW, EVEN THOUGH UPDATE IS
-- UNUSED TODAY
--
-- Only DELETE is currently exercised by app code
-- (useChatMessageActions.ts, "delete for everyone"). Confirmed via
-- useChatMessageActions.ts + set_chat_message_deletion()
-- (20260728000000_unify_chat_message_deletion_rpc.sql) that ONLY the
-- original sender can ever reach that delete_for_everyone call, both
-- client-side (openMessageActionSheet only offers "Delete for
-- everyone" when message.user_id === currentUserId) and enforced
-- server-side (the RPC raises if the caller isn't v_sender_id) -- so
-- the caller of storage.remove([imageUrl]) is always the image's own
-- uploader, and an owner_id-scoped DELETE policy is exactly correct
-- and sufficient. An UPDATE policy is added alongside it for symmetry
-- with the other two buckets and because a future upsert:true (not
-- this phase) requires UPDATE privilege on the row it overwrites --
-- adding it now is harmless (grants nothing to non-owners; nothing
-- currently calls it) and avoids a second migration later solely to
-- add it.
--
-- INSERT'S OWNERSHIP CHECK IS DEFENSE-IN-DEPTH, NOT THE PRIMARY FIX
--
-- Because the Storage service always attributes a new upload's
-- owner_id to the uploading caller (not client-settable), an
-- owner_id = auth.uid() WITH CHECK on INSERT is essentially always
-- satisfied for a normal upload -- it doesn't, by itself, prevent
-- writing a *new* object at an arbitrary path (that protection instead
-- comes from path randomness + upsert:false, unchanged by this
-- migration). The severe, previously-exploitable gap this migration
-- actually closes is on UPDATE/DELETE, which now require the caller to
-- already own the EXISTING row being modified or removed -- that is
-- what stops one user from overwriting or deleting another user's
-- already-uploaded avatar/post/chat image.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH
--
--   * uploadImage() (src/utils/supabaseImages.ts) -- unchanged.
--   * Any frontend upload call site -- unchanged.
--   * SELECT policies ("Users list own {bucket} folder") -- left as-is.
--     They're already folder-scoped and mostly ineffective for the
--     same reason described above, but they grant no write access, and
--     public image display bypasses them entirely (avatars/post-images/
--     chat-images are all Storage-public buckets; SupabaseImage.tsx/
--     ResponsiveImage.tsx render via the public URL, not an
--     authenticated SELECT). Auditing SELECT policies is out of scope
--     for this phase.
--   * Deterministic path generation -- a separate, not-yet-approved
--     phase (6.2).
--   * delete-post Edge Function's storage cleanup -- uses the service
--     role key, which bypasses RLS entirely; unaffected by any policy
--     change here.
-- ============================================================

-- ---- avatars ----

DROP POLICY IF EXISTS "Allow authenticated uploads to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars"     ON storage.objects;
DROP POLICY IF EXISTS "Users can update avatars"                ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars"     ON storage.objects;
DROP POLICY IF EXISTS "Users can delete avatars"                ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars"     ON storage.objects;

CREATE POLICY "Owner can upload to avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can update own avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'avatars' AND owner_id = (auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can delete own avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND owner_id = (auth.uid())::text);

-- ---- post-images ----

DROP POLICY IF EXISTS "Allow authenticated uploads to post-images"   ON storage.objects;
DROP POLICY IF EXISTS "Full access to authenticated users 1hys5dx_1" ON storage.objects;
DROP POLICY IF EXISTS "Full access to authenticated users 1hys5dx_2" ON storage.objects;
DROP POLICY IF EXISTS "Full access to authenticated users 1hys5dx_3" ON storage.objects;

CREATE POLICY "Owner can upload to post-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-images' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can update own post-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'post-images' AND owner_id = (auth.uid())::text)
  WITH CHECK (bucket_id = 'post-images' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can delete own post-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'post-images' AND owner_id = (auth.uid())::text);

-- ---- chat-images ----

DROP POLICY IF EXISTS "Allow authenticated uploads to chat-images" ON storage.objects;

CREATE POLICY "Owner can upload to chat-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can update own chat-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'chat-images' AND owner_id = (auth.uid())::text)
  WITH CHECK (bucket_id = 'chat-images' AND owner_id = (auth.uid())::text);

CREATE POLICY "Owner can delete own chat-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND owner_id = (auth.uid())::text);

COMMIT;
