import {
  COMMUNITY_DESCRIPTION_MAX_LENGTH,
  COMMUNITY_NAME_MAX_LENGTH,
  COMMUNITY_NAME_MIN_LENGTH,
} from "../constants/validationConstants";

export function validateCommunityName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < COMMUNITY_NAME_MIN_LENGTH) {
    return `Community name must be at least ${COMMUNITY_NAME_MIN_LENGTH} characters.`;
  }
  if (trimmed.length > COMMUNITY_NAME_MAX_LENGTH) {
    return `Community name must be at most ${COMMUNITY_NAME_MAX_LENGTH} characters.`;
  }
  return null;
}

export function validateCommunityDescription(
  description: string | null | undefined,
): string | null {
  const trimmed = description?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > COMMUNITY_DESCRIPTION_MAX_LENGTH) {
    return `Community description must be at most ${COMMUNITY_DESCRIPTION_MAX_LENGTH} characters.`;
  }
  return null;
}

export function normalizeCommunityName(name: string): string {
  const error = validateCommunityName(name);
  if (error) throw new Error(error);
  return name.trim();
}

export function normalizeCommunityDescription(
  description: string | null | undefined,
): string | null {
  const error = validateCommunityDescription(description);
  if (error) throw new Error(error);
  const trimmed = description?.trim() ?? "";
  return trimmed || null;
}
