import { supabase } from '../lib/supabase';

type ActivityEvent =
  | 'session_start'
  | 'engaged_session'
  | 'post_created'
  | 'comment_created'
  | 'community_created';

/**
 * Fire-and-forget analytics event. Never awaited, never throws.
 * Call after the user action is complete — do not block on it.
 *
 * Logs in all environments including __DEV__ and Expo Go so development
 * sessions appear in the analytics dashboard alongside production traffic.
 * Each caller passes userId directly to avoid re-fetching the session and
 * to guarantee the correct user is recorded (important when accounts switch).
 */
export function logActivity(eventType: ActivityEvent, universityId: string, userId: string): void {
  if (__DEV__) {
    console.log('[activityLogger]', eventType, universityId);
  }
  void (async () => {
    try {
      await (supabase as any)
        .from('user_activity_events')
        .insert({ event_type: eventType, university_id: universityId, user_id: userId });
    } catch {
      // silent — never interrupt the UI
    }
  })();
}
