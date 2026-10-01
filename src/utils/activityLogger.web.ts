/**
 * Web fallback for activityLogger.ts. The web build only serves the
 * read-only post card preview (src/app/preview/post-card.tsx), and every
 * preview page load restores a session — which would otherwise insert a
 * session_start row into user_activity_events and count each screenshot as
 * an app open in analytics. The preview must never write, so this is a no-op.
 */
type ActivityEvent =
  | "session_start"
  | "engaged_session"
  | "post_created"
  | "comment_created"
  | "community_created";

export function logActivity(
  _eventType: ActivityEvent,
  _universityId: string,
  _userId: string,
): void {}
