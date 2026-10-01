type BanFields = {
  is_permanently_banned?: boolean | null;
  banned_until?: string | null;
};

/**
 * Whether a profile is currently banned (permanently, or until a future
 * date). Shared by the protected layout's BannedScreen gate and the web
 * post card preview, which sits outside that layout.
 */
export function isProfileBanned(
  profile: BanFields | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile) return false;
  return (
    profile.is_permanently_banned === true ||
    (profile.banned_until != null && new Date(profile.banned_until) > now)
  );
}
