import { supabase } from '../lib/supabase';

type ActivityEvent =
  | 'session_start'
  | 'engaged_session'
  | 'post_created'
  | 'comment_created'
  | 'community_created';

/**
 * Fire-and-forget. Never awaited in UI code. Never throws.
 * Call after the user action is already complete — do not block on it.
 */
export function logActivity(eventType: ActivityEvent, universityId: string): void {
  if (__DEV__) {
    console.log('[activityLogger]', eventType, universityId);
    return;
  }

  // Cast to any: user_activity_events won't appear in generated types until
  // the migration is applied and types are regenerated.
  void (async () => {
    try {
      await (supabase as any)
        .from('user_activity_events')
        .insert({ event_type: eventType, university_id: universityId });
    } catch {
      // silent — never let logging break the UI
    }
  })();
}
