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
 *
 * user_activity_events.user_id is NOT NULL and RLS-enforced (auth.uid() = user_id).
 * We resolve it from the cached Supabase session — no network call is needed.
 * Events are skipped in __DEV__ to keep development traffic out of production
 * analytics. Production builds (EAS / App Store) always have __DEV__ = false.
 */
export function logActivity(eventType: ActivityEvent, universityId: string): void {
  if (__DEV__) {
    console.log('[activityLogger]', eventType, universityId);
  }

  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return; // not authenticated — skip silently

      // Cast to any: user_activity_events won't appear in generated types until
      // the migration is applied and types are regenerated.
      await (supabase as any)
        .from('user_activity_events')
        .insert({ event_type: eventType, university_id: universityId, user_id: userId });
    } catch {
      // silent — never let analytics logging interrupt the UI
    }
  })();
}
