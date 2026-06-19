import { useQuery } from '@tanstack/react-query';
import { fetchMyMatch } from '../data/queries';
import type { MatchWithPartnerInfo } from '../types';

export function useMyMatch(userId?: string) {
  return useQuery<MatchWithPartnerInfo | null>({
    queryKey: ['matchmaking', 'my-match', userId],
    queryFn: fetchMyMatch,
    enabled: !!userId,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
  });
}
