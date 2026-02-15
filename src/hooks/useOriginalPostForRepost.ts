import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { PostsSummaryViewRow } from "../types/posts";

export function useOriginalPostForRepost(repostId: string | string[] | undefined) {
  const resolvedId =
    typeof repostId === "string" ? repostId : Array.isArray(repostId) ? repostId[0] : undefined;

  const query = useQuery<PostsSummaryViewRow | null>({
    queryKey: ["original-post", resolvedId],
    enabled: Boolean(resolvedId),
    queryFn: async () => {
      if (!resolvedId) return null;
      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .eq("post_id", resolvedId)
        .or("is_banned.is.null,is_banned.eq.false")
        .maybeSingle<PostsSummaryViewRow>();

      if (error) throw error;
      return data ?? null;
    },
  });

  return {
    originalPost: query.data ?? null,
    isLoadingOriginal: query.isLoading,
    query,
  };
}

