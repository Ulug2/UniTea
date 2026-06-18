import { UNIVERSITY_BRANDING } from "../config/universityBranding";

export function extractEmailDomain(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

export function isKnownUniversityDomain(
  domain: string | null | undefined,
): domain is keyof typeof UNIVERSITY_BRANDING {
  return !!domain && domain in UNIVERSITY_BRANDING;
}

/**
 * Resolves the user's university domain synchronously — no network required.
 * Priority: profile domain → AsyncStorage cache → email domain suffix.
 */
export function resolveUniversityDomain(input: {
  profileUniversityDomain?: string | null;
  cachedUniversityDomain?: string | null;
  userEmail?: string | null;
}): string | null {
  const candidates = [
    input.profileUniversityDomain,
    input.cachedUniversityDomain,
    extractEmailDomain(input.userEmail),
  ];

  for (const domain of candidates) {
    if (isKnownUniversityDomain(domain)) {
      return domain;
    }
  }

  return null;
}
