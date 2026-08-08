import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { PostsSummaryViewRow } from "../../../types/posts";

/**
 * Single source of truth for the Post Detail screen's own post-row query
 * (["post", postId]) — shared so a list item can prefetch the exact same
 * query the detail screen will run on navigation (see PostListItem's
 * onPress handlers), the same pattern usePoll.ts already documents for
 * Poll.tsx/post/[id].tsx.
 */
export function postDetailQueryOptions(postId: string | null | undefined) {
  return {
    queryKey: ["post", postId] as const,
    queryFn: async (): Promise<PostsSummaryViewRow | null> => {
      if (!postId) return null;
      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .eq("post_id", postId)
        .or("is_banned.is.null,is_banned.eq.false")
        .limit(1);
      if (error) throw error;
      const row = data && data.length > 0 ? data[0] : null;
      if (!row) return null;
      return row as PostsSummaryViewRow;
    },
    staleTime: 1000 * 60 * 5, // Post stays fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  };
}

/**
 * Fire-and-forget network head-start for Post Detail, called the moment a
 * user taps into a post (see PostListItem.tsx). Uses the exact same
 * queryKey/queryFn as the screen's own useQuery, so React Query dedupes it —
 * a no-op if the data is already fresh, a real request otherwise. This is a
 * genuine prefetch of the real query (never synthesized/partial data), so it
 * can't drift out of sync with the view's moderation-relevant fields
 * (is_author_blocked_by_viewer, is_banned, etc.).
 */
export function prefetchPostDetail(
  queryClient: QueryClient,
  postId: string | null | undefined,
): void {
  if (!postId) return;
  void queryClient.prefetchQuery(postDetailQueryOptions(postId));
}
