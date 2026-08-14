import { useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";
import { useMyProfile } from "../../profile/hooks/useMyProfile";
import { communitiesTable } from "../data/client";
import { communityKeys } from "../data/queryKeys";
import { mapCommunityRow, type CommunityQueryRow } from "../data/mapCommunityRow";
import type { CommunityDirectoryEntry } from "../types";

const COMMUNITIES_PER_PAGE = 20;

/**
 * Single source of truth for the community directory's infinite query —
 * shared so the Discover entry point can prefetch exactly the first page
 * the directory screen itself will render (see CommunityFilterBar's
 * onDiscover handler in src/app/(protected)/(tabs)/index.tsx), the same
 * pattern postDetailQuery.ts established for Post Detail (Phase 7.8).
 */
export function universityCommunitiesQueryOptions(
  universityId: string | undefined,
  search: string = "",
) {
  const normalizedSearch = search.trim().replace(/[%*]/g, "");

  return {
    queryKey: [...communityKeys.directory(universityId), normalizedSearch],
    queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
      if (!universityId) return [];

      let q = communitiesTable()
        .select(
          "id, name, description, avatar_url, university_id, created_by, created_at, community_members(count)",
        )
        .eq("university_id", universityId);

      if (normalizedSearch.length > 0) {
        q = q.ilike("name", `%${normalizedSearch}%`);
      }

      const from = pageParam * COMMUNITIES_PER_PAGE;
      const to = from + COMMUNITIES_PER_PAGE - 1;

      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data ?? []).map((row) =>
        mapCommunityRow(row as CommunityQueryRow),
      );
    },
    getNextPageParam: (
      lastPage: CommunityDirectoryEntry[],
      allPages: CommunityDirectoryEntry[][],
    ) => {
      if (lastPage.length === COMMUNITIES_PER_PAGE) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled: Boolean(universityId),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  };
}

/**
 * Fire-and-forget network head-start for the Discover screen, called the
 * moment the user taps "Discover" (see CommunityFilterBar's onDiscover in
 * index.tsx). prefetchInfiniteQuery only ever fetches the first page
 * (pageParam defaults to initialPageParam), matching "only the first
 * visible screenful, not hundreds of communities." Uses the exact same
 * queryKey/queryFn as the screen's own useInfiniteQuery, so React Query
 * dedupes it — a no-op if already fresh, a real request otherwise.
 */
export function prefetchUniversityCommunitiesFirstPage(
  queryClient: QueryClient,
  universityId: string | undefined,
): void {
  if (!universityId) return;
  void queryClient.prefetchInfiniteQuery(
    universityCommunitiesQueryOptions(universityId, ""),
  );
}

/**
 * All communities in the current user's university (RLS scopes the rows),
 * paginated so a popular university never loads an unbounded list.
 *
 * `search` filters server-side by name. Results stay bounded per page.
 */
export function useUniversityCommunities(search: string = "") {
  const { session } = useAuth();
  const {
    data: profile,
    isPending: isProfilePending,
    isFetched: isProfileFetched,
  } = useMyProfile(session?.user?.id);
  const universityId = profile?.university_id;

  const query = useInfiniteQuery(
    universityCommunitiesQueryOptions(universityId, search),
  );

  const communities = (query.data?.pages ?? []).flat();

  const isInitialLoading =
    isProfilePending ||
    (Boolean(universityId) && query.isPending && !query.data);

  return {
    communities,
    universityId,
    isProfileFetched,
    isInitialLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}
