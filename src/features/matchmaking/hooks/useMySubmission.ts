import { useQuery } from '@tanstack/react-query';
import { fetchMySubmission } from '../data/queries';
import type { LaunchEventProfile } from '../types';

export function useMySubmission(userId?: string) {
  return useQuery<LaunchEventProfile | null>({
    queryKey: ['matchmaking', 'my-submission', userId],
    queryFn: () => fetchMySubmission(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    retry: 2,
    select: (data) => data,
  });
}
