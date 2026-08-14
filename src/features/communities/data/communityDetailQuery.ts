import type { QueryClient } from "@tanstack/react-query";
import { communitiesTable } from "./client";
import { communityKeys } from "./queryKeys";
import { mapCommunityRow, type CommunityQueryRow } from "./mapCommunityRow";
import type { CommunityDirectoryEntry } from "../types";

/**
 * Single source of truth for a single community's detail query — shared so
 * Discover can prefetch the exact query the Community View screen itself
 * runs (useCommunity below spreads this same options object). Mirrors
 * src/features/posts/data/postDetailQuery.ts's pattern for Post Detail
 * (Phase 7.8) and lostFoundDetailQuery.ts for Lost & Found (Phase 2).
 */
export function communityDetailQueryOptions(communityId: string | undefined) {
  return {
    queryKey: communityKeys.detail(communityId),
    queryFn: async (): Promise<CommunityDirectoryEntry> => {
      if (!communityId) throw new Error("Missing community id");
      // `updated_at` isn't reflected in the generated Database types yet
      // (see types.ts) — cast per project convention rather than
      // regenerating types from the live schema.
      const { data, error } = await (communitiesTable() as any)
        .select(
          "id, name, description, avatar_url, university_id, created_by, created_at, updated_at, community_members(count)",
        )
        .eq("id", communityId)
        .single();

      if (error) throw error;
      return mapCommunityRow(data as CommunityQueryRow);
    },
    enabled: Boolean(communityId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  };
}

/**
 * Fire-and-forget network head-start for the Community View screen, called
 * the moment a user taps a community in Discover (see communities/index.tsx).
 * Uses the exact same queryKey/queryFn as the screen's own useCommunity(),
 * so React Query dedupes it — a no-op if already fresh, a real request
 * otherwise.
 */
export function prefetchCommunityDetail(
  queryClient: QueryClient,
  communityId: string | undefined,
): void {
  if (!communityId) return;
  void queryClient.prefetchQuery(communityDetailQueryOptions(communityId));
}
