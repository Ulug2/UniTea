import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { fetchEventConfig } from '../data/queries';
import type { EventPhase } from '../types';

export function useEventConfig() {
  const queryClient = useQueryClient();

  // Realtime subscription: instantly refetch when an admin flips the phase
  // in the Supabase dashboard — no app restart or manual refresh needed.
  useEffect(() => {
    const channel = supabase
      .channel('launch-event-config-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'launch_event_config' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['matchmaking', 'config'] });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery<EventPhase>({
    queryKey: ['matchmaking', 'config'],
    queryFn: fetchEventConfig,
    // 60s staleTime: refetches on app foreground without hammering the DB,
    // while Realtime handles instant updates the moment an admin changes phase.
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });
}
