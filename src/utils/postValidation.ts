import {
  POST_BODY_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from "../constants/validationConstants";

export function validatePostTitle(title: string | null | undefined): string | null {
  const trimmed = title?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > POST_TITLE_MAX_LENGTH) {
    return `Title must be at most ${POST_TITLE_MAX_LENGTH} characters.`;
  }
  return null;
}

export function validatePostBody(body: string | null | undefined): string | null {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > POST_BODY_MAX_LENGTH) {
    return `Post content must be at most ${POST_BODY_MAX_LENGTH} characters.`;
  }
  return null;
}

export function normalizePostTitle(title: string | null | undefined): string | null {
  const error = validatePostTitle(title);
  if (error) throw new Error(error);
  const trimmed = title?.trim() ?? "";
  return trimmed || null;
}

export function normalizePostBody(body: string | null | undefined): string {
  const error = validatePostBody(body);
  if (error) throw new Error(error);
  return body?.trim() ?? "";
}
