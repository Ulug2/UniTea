import { useQuery } from '@tanstack/react-query';
import { fetchEventConfig } from '../data/queries';
import type { EventPhase } from '../types';

export function useEventConfig() {
  return useQuery<EventPhase>({
    queryKey: ['matchmaking', 'config'],
    queryFn: fetchEventConfig,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });
}
