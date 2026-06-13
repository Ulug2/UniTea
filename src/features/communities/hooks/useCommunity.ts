import { useQuery } from "@tanstack/react-query";
import { communitiesTable } from "../data/client";
import { communityKeys } from "../data/queryKeys";
import type { Community } from "../types";

/** Single community details by id. */
export function useCommunity(communityId: string | undefined) {
  return useQuery({
    queryKey: communityKeys.detail(communityId),
    queryFn: async () => {
      if (!communityId) throw new Error("Missing community id");
      const { data, error } = await communitiesTable()
        .select(
          "id, name, description, avatar_url, university_id, created_by, created_at",
        )
        .eq("id", communityId)
        .single();

      if (error) throw error;
      return data as Community;
    },
    enabled: Boolean(communityId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });
}
