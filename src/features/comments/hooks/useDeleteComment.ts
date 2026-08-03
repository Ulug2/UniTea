import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { feedKeys } from "../../communities/data/queryKeys";

type Options = {
  postId?: string | null;
  currentUserId?: string | null;
  /**
   * The parent post's community (null for Campus Feed). When provided,
   * scopes the feed-row refresh (comment_count) to just that community
   * instead of every mounted Campus/community feed. Falls back to the
   * previous broad-but-lazy invalidation when omitted (e.g. a caller that
   * hasn't threaded it through yet).
   */
  communityId?: string | null;
  onSuccess?: () => void;
  onError?: () => void;
};

export function useDeleteComment(commentId: string, options?: Options) {
  const queryClient = useQueryClient();
  const { postId, currentUserId, communityId, onSuccess, onError } = options ?? {};

  return useMutation({
    mutationFn: async () => {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase configuration");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("You must be logged in to delete comments");

      const res = await fetch(`${supabaseUrl}/functions/v1/delete-comment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ comment_id: commentId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete comment");
    },
    onSuccess: async () => {
      if (postId && currentUserId) {
        await queryClient.refetchQueries({
          queryKey: ["comments", postId, currentUserId],
        });
      }
      // Scoped to this post's own thread (any viewer) when postId is known;
      // falls back to every thread only if a caller genuinely can't supply it.
      queryClient.invalidateQueries({
        queryKey: postId ? ["comments", postId] : ["comments"],
      });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      // Lazy (refetchType: "none") to match useCreateComment's established
      // pattern for the symmetric operation — don't force every mounted
      // feed to refetch immediately just because a comment count changed.
      if (communityId !== undefined) {
        queryClient.invalidateQueries({
          predicate: feedKeys.belongsToCommunity(communityId),
          refetchType: "none",
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["posts"], refetchType: "none" });
      }
      // Refetch immediately if Profile's "user-posts" query is mounted (default
      // 'active' behavior) — Profile's tab screen never unmounts once visited,
      // so 'none' here used to leave this permanently stale for the rest of the
      // session once Profile had already been opened once (Phase 7.2).
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] });
      onSuccess?.();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete comment. Please try again.";
      Alert.alert("Error", message);
      onError?.();
    },
  });
}
