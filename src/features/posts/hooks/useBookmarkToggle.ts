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
        const { error } = await supabase.from("bookmarks").insert({
          user_id: viewerId,
          post_id: postId,
        });
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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update bookmark. Please try again.";
      Alert.alert("Error", message);
    },
    onSuccess: () => {
      if (!viewerId || !postId) return;
      queryClient.invalidateQueries({ queryKey: ["bookmarks", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
      queryClient.invalidateQueries({
        queryKey: ["user-posts", viewerId],
        refetchType: "none",
      });
    },
  });
}

