import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

type Options = {
  postId?: string | null;
  currentUserId?: string | null;
  onSuccess?: () => void;
  onError?: () => void;
};

export function useDeleteComment(commentId: string, options?: Options) {
  const queryClient = useQueryClient();
  const { postId, currentUserId, onSuccess, onError } = options ?? {};

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
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-post-comments"] });
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
