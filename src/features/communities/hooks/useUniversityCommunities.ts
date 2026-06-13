import { useInfiniteQuery } from "@tanstack/react-query";
import { useMyProfile } from "../../profile/hooks/useMyProfile";
import { communitiesTable } from "../data/client";
import { communityKeys } from "../data/queryKeys";
import type { Community, CommunityDirectoryEntry } from "../types";

const COMMUNITIES_PER_PAGE = 20;

type CommunityQueryRow = Community & {
  community_members: { count: number }[];
};

function mapCommunityRow(row: CommunityQueryRow): CommunityDirectoryEntry {
  const { community_members, ...community } = row;
  return {
    ...community,
    member_count: community_members?.[0]?.count ?? 0,
  };
}

/**
 * All communities in the current user's university (RLS scopes the rows),
 * paginated so a popular university never loads an unbounded list.
 *
 * `search` filters server-side by name. Results stay bounded per page.
 */
export function useUniversityCommunities(search: string = "") {
  const {
    data: profile,
    isPending: isProfilePending,
    isFetched: isProfileFetched,
  } = useMyProfile();
  const universityId = profile?.university_id;

  const normalizedSearch = search.trim().replace(/[%*]/g, "");

  const query = useInfiniteQuery({
    queryKey: [...communityKeys.directory(universityId), normalizedSearch],
    queryFn: async ({ pageParam = 0 }) => {
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
  });

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
