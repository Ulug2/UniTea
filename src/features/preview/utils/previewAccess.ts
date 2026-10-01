import type { PostsSummaryViewRow } from "../../../types/posts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Client-side gate for the web post card preview, applied on top of what
 * RLS already enforces server-side (posts SELECT is scoped to the viewer's
 * own university and excludes deleted posts; posts_summary_view is
 * security_invoker and redacts anonymous authors). Mirrors the moderation
 * rules the mobile feed and Post Detail apply: only regular feed posts, never
 * banned/deleted content, never a post whose author (or reposted original
 * author) the viewer has blocked, and never a post outside the viewer's own
 * university.
 */
export function isPreviewablePost(
  row: PostsSummaryViewRow | null | undefined,
  viewerUniversityId: string | null | undefined,
): row is PostsSummaryViewRow {
  if (!row || !viewerUniversityId) return false;
  return (
    row.post_type === "feed" &&
    row.university_id === viewerUniversityId &&
    row.is_deleted !== true &&
    row.is_banned !== true &&
    row.is_author_blocked_by_viewer !== true &&
    row.is_original_author_blocked_by_viewer !== true
  );
}
