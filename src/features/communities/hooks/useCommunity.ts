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
      // `updated_at` isn't reflected in the generated Database types yet
      // (see types.ts) — cast per project convention rather than
      // regenerating types from the live schema.
      const { data, error } = await (communitiesTable() as any)
        .select(
          "id, name, description, avatar_url, university_id, created_by, created_at, updated_at",
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
