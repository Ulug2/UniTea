import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "../constants/validationConstants";

const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * Client-side mirror of the database's is_valid_username()/
 * profiles_username_format_check (Phase 7.6.1) — fails obviously-invalid
 * input fast, without a round trip. The database constraint remains the
 * actual source of truth for format and (case-insensitive) uniqueness;
 * this only improves the error message shown before that constraint is
 * ever reached.
 */
export function validateUsername(username: string | null | undefined): string | null {
  const trimmed = username?.trim() ?? "";
  if (!trimmed) return "Username cannot be empty.";
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return `Username must be at most ${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    return "Username can only contain letters, numbers, and underscores.";
  }
  return null;
}
