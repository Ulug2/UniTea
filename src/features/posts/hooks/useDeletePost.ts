import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "../../../lib/supabase";

export function useDeletePost(postId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!postId) throw new Error("Post ID is required");

      const { error } = await supabase.from("posts").delete().eq("id", postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-post-comments"] });
      queryClient.invalidateQueries({ queryKey: ["user-post-votes"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] });

      router.back();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete post. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

