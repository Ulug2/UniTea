import { getPublicStorageUrl } from "./publicStorageUrl";

/**
 * Synchronous public URL for an avatar storage path or full http(s) URI.
 * `version` (e.g. the profile's updated_at) busts client/CDN caches when
 * the deterministic avatar path (avatars/{userId}/avatar.{ext}) is
 * overwritten in place.
 */
export function getAvatarUri(avatarUrl: string, version?: string | null): string {
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return getPublicStorageUrl("avatars", avatarUrl, version);
}
