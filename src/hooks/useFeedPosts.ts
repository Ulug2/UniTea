import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { PostsSummaryViewRow } from "../types/posts";
import { feedKeys } from "../features/communities/data/queryKeys";

export const POSTS_PER_PAGE = 10;

export type FeedFilterType = "hot" | "new" | "top";

type UseFeedPostsParams = {
  filter: FeedFilterType;
  activeSearchQuery: string;
  universityId: string | undefined;
  /**
   * When set, fetch posts for that community. When null, fetch the public
   * Campus Feed (posts where community_id IS NULL).
   */
  communityId: string | null;
  enabled?: boolean;
};

/**
 * Reusable infinite query for the main feed and community feeds.
 *
 * The `communityId` is part of the query key (via `feedKeys.list`) so each
 * community and the Campus Feed cache independently — switching pills serves
 * cached pages instantly instead of refetching.
 */
export function useFeedPosts({
  filter,
  activeSearchQuery,
  universityId,
  communityId,
  enabled = true,
}: UseFeedPostsParams) {
  return useInfiniteQuery({
    queryKey: feedKeys.list(filter, activeSearchQuery, universityId, communityId),
    queryFn: async ({ pageParam = 0 }) => {
      let query = (supabase as any)
        .from("posts_summary_view")
        .select("*")
        .eq("post_type", "feed")
        .not("is_banned", "is", "true");

      if (universityId) {
        query = query.eq("university_id", universityId);
      }

      // Campus Feed shows only un-scoped posts; community feeds show only
      // their own. This split is backed by the partial indexes added in
      // 20260612120000_add_communities.sql.
      if (communityId) {
        query = query.eq("community_id", communityId);
      } else {
        query = query.is("community_id", null);
      }

      const normalizedSearch = activeSearchQuery
        .trim()
        .replace(/[%*]/g, "")
        .replace(/,/g, " ");
      if (normalizedSearch.length > 0) {
        const pattern = `*${normalizedSearch}*`;
        query = query.or(
          `title.ilike.${pattern},and(title.is.null,content.ilike.${pattern}),and(title.eq."",content.ilike.${pattern})`,
        );
      }

      const from = pageParam * POSTS_PER_PAGE;
      const to = from + POSTS_PER_PAGE - 1;

      switch (filter) {
        case "new":
          query = query
            .order("created_at", { ascending: false })
            .range(from, to);
          break;

        case "top": {
          const lastWeek = new Date();
          lastWeek.setDate(lastWeek.getDate() - 7);
          query = query
            .gte("created_at", lastWeek.toISOString())
            .order("vote_score", { ascending: false })
            .range(from, to);
          break;
        }

        case "hot": {
          const last7Days = new Date();
          last7Days.setDate(last7Days.getDate() - 7);
          query = query
            .gte("created_at", last7Days.toISOString())
            .order("hot_score", { ascending: false })
            .range(from, to);
          break;
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PostsSummaryViewRow[];
    },
    getNextPageParam: (lastPage: PostsSummaryViewRow[], allPages: PostsSummaryViewRow[][]) => {
      if (lastPage.length === POSTS_PER_PAGE) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    enabled,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });
}
