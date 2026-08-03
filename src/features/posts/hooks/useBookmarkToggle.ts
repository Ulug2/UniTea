import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

type UseBookmarkToggleOptions = {
  postId: string | null | undefined;
  viewerId: string | null;
};

export function useBookmarkToggle({ postId, viewerId }: UseBookmarkToggleOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shouldBookmark: boolean) => {
      if (!viewerId || !postId) throw new Error("User or post ID missing");

      if (shouldBookmark) {
        const { error } = await supabase.from("bookmarks").upsert(
          {
            user_id: viewerId,
            post_id: postId,
          },
          { onConflict: "user_id,post_id", ignoreDuplicates: true }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", viewerId)
          .eq("post_id", postId);
        if (error) throw error;
      }
    },
    onError: (error: unknown) => {
      const supabaseMessage = (error as { message?: unknown } | null)?.message;
      const message =
        error instanceof Error
          ? error.message
          : typeof supabaseMessage === "string"
            ? supabaseMessage
            : "Failed to update bookmark. Please try again.";
      Alert.alert("Error", message);
    },
    onSuccess: () => {
      if (!viewerId || !postId) return;
      // Bookmark state is only ever read from ["bookmarks", postId] (post
      // detail) and ["user-posts", viewerId] (profile's Bookmarked tab) —
      // never from the feed cache, so there's nothing to invalidate there.
      // Invalidating ["posts","feed"] used to force every mounted community's
      // (and Campus's) feed to refetch simultaneously for no reason.
      queryClient.invalidateQueries({ queryKey: ["bookmarks", postId] });
      // Refetch immediately if Profile's "user-posts" query is mounted (default
      // 'active' behavior) — Profile's tab screen never unmounts once visited,
      // so 'none' here used to leave this permanently stale for the rest of the
      // session once Profile had already been opened once (Phase 7.2).
      queryClient.invalidateQueries({
        queryKey: ["user-posts", viewerId],
      });
    },
  });
}

