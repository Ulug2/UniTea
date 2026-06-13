const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

/** Synchronous public URL for an avatar storage path or full http(s) URI. */
export function getAvatarUri(avatarUrl: string): string {
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarUrl}`;
}
