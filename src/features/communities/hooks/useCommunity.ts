import { useQuery } from "@tanstack/react-query";
import { communityDetailQueryOptions } from "../data/communityDetailQuery";

/**
 * Single community details by id. Shares its query options with
 * prefetchCommunityDetail (see communityDetailQuery.ts) so Discover's
 * tap-to-prefetch and this hook can never drift out of sync — React Query
 * dedupes the request when both target the same key.
 */
export function useCommunity(communityId: string | undefined) {
  return useQuery(communityDetailQueryOptions(communityId));
}
