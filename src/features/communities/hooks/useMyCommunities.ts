import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";
import { communityMembersTable } from "../data/client";
import { communityKeys } from "../data/queryKeys";
import type { Community } from "../types";

/**
 * Communities the current user has joined.
 *
 * Returns the list plus a `Set` of joined ids for O(1) membership checks in
 * the directory (avoids a per-row query).
 */
export function useMyCommunities() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const query = useQuery({
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
  });

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
