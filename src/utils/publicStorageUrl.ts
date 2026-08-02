const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

/**
 * Single source of truth for building a public Supabase Storage URL,
 * shared by every render path (SupabaseImage, ResponsiveImage, the
 * avatar-specific getAvatarUri helper) so cache-busting logic exists in
 * exactly one place.
 *
 * `version`, when provided, is appended as a `?v=` query parameter.
 * Since deterministic storage paths (avatars/{userId}/avatar.{ext},
 * post-images/{communityId}/avatar.{ext}) reuse the same URL across
 * replacements, this is what actually changes the effective cache key
 * for the CDN (Cache-Control: 3600 on the object) and for expo-image's
 * own disk cache — both key purely on the URL string, not on the
 * object's actual content.
 */
export function getPublicStorageUrl(
  bucket: string,
  path: string,
  version?: string | number | null,
): string {
  const base = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  return version ? `${base}?v=${encodeURIComponent(String(version))}` : base;
}
