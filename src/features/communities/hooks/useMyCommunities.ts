import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";
import { communityMembersTable } from "../data/client";
import { communityKeys } from "../data/queryKeys";
import type { Community } from "../types";

/**
 * Single source of truth for the "communities I've joined" query — shared
 * so the Discover entry point can prefetch the exact membership state it
 * needs to render Join/Leave correctly on first paint (see
 * prefetchMyCommunities below).
 */
export function myCommunitiesQueryOptions(userId: string | undefined) {
  return {
    queryKey: communityKeys.mine(userId),
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await communityMembersTable()
        .select(
          "joined_at, community:communities(id, name, description, avatar_url, university_id, created_by, created_at)",
        )
        .eq("user_id", userId)
        .order("joined_at", { ascending: false });

      if (error) throw error;

      return ((data ?? []) as Array<{ community: Community | null }>)
        .map((row) => row.community)
        .filter((c): c is Community => Boolean(c));
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  };
}

/**
 * Fire-and-forget network head-start for the Discover screen's Join/Leave
 * button state, called the moment "Discover" is tapped. Dedupes against
 * the screen's own useMyCommunities() call via the same query key.
 */
export function prefetchMyCommunities(
  queryClient: QueryClient,
  userId: string | undefined,
): void {
  if (!userId) return;
  void queryClient.prefetchQuery(myCommunitiesQueryOptions(userId));
}

/**
 * Communities the current user has joined.
 *
 * Returns the list plus a `Set` of joined ids for O(1) membership checks in
 * the directory (avoids a per-row query).
 */
export function useMyCommunities() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const query = useQuery(myCommunitiesQueryOptions(userId));

  const joinedIds = useMemo(
    () => new Set((query.data ?? []).map((c) => c.id)),
    [query.data],
  );

  return {
    communities: query.data ?? [],
    joinedIds,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
