import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { PostsSummaryViewRow } from "../../../types/posts";

/**
 * Single source of truth for the Lost & Found detail screen's own post-row
 * query (["lostfound-detail", postId]) — shared so a list item can prefetch
 * the exact same query the detail screen will run on navigation (see
 * LostFoundListItem.tsx's onPress handlers). Mirrors
 * src/features/posts/data/postDetailQuery.ts's pattern for Post Detail.
 */
export function lostFoundDetailQueryOptions(postId: string | null | undefined) {
  return {
    queryKey: ["lostfound-detail", postId] as const,
    queryFn: async (): Promise<PostsSummaryViewRow | null> => {
      if (!postId) return null;
      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .eq("post_id", postId)
        .maybeSingle();
      if (error) throw error;
      return data as PostsSummaryViewRow | null;
    },
    staleTime: 1000 * 60 * 5, // Post stays fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
  };
}

/**
 * Fire-and-forget network head-start for Lost & Found detail, called the
 * moment a user taps into a post (see LostFoundListItem.tsx). Uses the
 * exact same queryKey/queryFn as the screen's own useQuery, so React Query
 * dedupes it — a no-op if the data is already fresh, a real request
 * otherwise. Never synthesizes/caches partial data — this is the real
 * detail query, just started slightly earlier.
 */
export function prefetchLostFoundDetail(
  queryClient: QueryClient,
  postId: string | null | undefined,
): void {
  if (!postId) return;
  void queryClient.prefetchQuery(lostFoundDetailQueryOptions(postId));
}
