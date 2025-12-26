-- ============================================================================
-- RLS POLICIES FOR "avatars" STORAGE BUCKET
-- ============================================================================
-- 
-- These policies ensure:
-- ✅ Users can only INSERT/UPDATE/DELETE their own avatars
-- ✅ Everyone (including anonymous) can VIEW all avatars
--
-- IMPORTANT: This requires avatars to be stored in user-specific folders:
--   Format: {user_id}/{filename}.jpg
--   Example: "550e8400-e29b-41d4-a716-446655440000/1234567890.jpeg"
--
-- ============================================================================
-- STEP-BY-STEP INSTRUCTIONS
-- ============================================================================
--
-- 1. Go to Supabase Dashboard: https://app.supabase.com
-- 2. Select your project
-- 3. Go to Storage in the left sidebar
-- 4. Click on "avatars" bucket (or create it if it doesn't exist)
-- 5. Go to Settings tab
-- 6. Enable "Public bucket" toggle (avatars should be publicly viewable)
-- 7. Go to SQL Editor in the left sidebar
-- 8. Copy and paste the policies below
-- 9. Click "Run" to execute
--
-- ============================================================================
-- POLICIES
-- ============================================================================

-- Policy 1: Users can only upload avatars to their own folder
-- Folder structure: {user_id}/{filename}.jpg
CREATE POLICY "Users can upload their own avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Users can only update their own avatars
CREATE POLICY "Users can update their own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Users can only delete their own avatars
CREATE POLICY "Users can delete their own avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Everyone (including anonymous users) can view all avatars
CREATE POLICY "Public can view avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- ============================================================================
-- HOW TO USE IN YOUR CODE
-- ============================================================================
--
-- When uploading an avatar, use the user_id as the folder:
--
--   const avatarPath = await uploadImage(
--     imageUri,
--     supabase,
--     "avatars",
--     session.user.id  // This creates: {user_id}/{filename}.jpg
--   );
--
-- The returned path will be: "{user_id}/{filename}.jpg"
-- Store this full path in profiles.avatar_url
--
-- When displaying, use:
--
--   <SupabaseImage
--     path={user.avatar_url}  // e.g., "550e8400.../1234567890.jpeg"
--     bucket="avatars"
--   />
--
-- ============================================================================

