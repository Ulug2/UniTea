import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { fetchEventConfig } from '../data/queries';
import type { EventPhase } from '../types';

// universityId scopes both the cache key and the realtime subscription.
// launch_event_config became one row per university in Phase 4, but this
// hook's query key was never updated to match — without it, switching
// accounts across universities on the same device could briefly serve the
// previous university's cached phase from React Query before a refetch
// overwrote it (Phase 6 finding, fixed here in Phase 8).
export function useEventConfig(universityId?: string) {
  const queryClient = useQueryClient();

  // Realtime subscription: instantly refetch when an admin flips the phase
  // in the Supabase dashboard — no app restart or manual refresh needed.
  useEffect(() => {
    if (!universityId) return;

    const channel = supabase
      .channel(`launch-event-config-changes-${universityId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'launch_event_config',
          filter: `university_id=eq.${universityId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['matchmaking', 'config', universityId] });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient, universityId]);

  return useQuery<EventPhase>({
    queryKey: ['matchmaking', 'config', universityId],
    queryFn: fetchEventConfig,
    enabled: !!universityId,
    // 60s staleTime: refetches on app foreground without hammering the DB,
    // while Realtime handles instant updates the moment an admin changes phase.
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });
}
