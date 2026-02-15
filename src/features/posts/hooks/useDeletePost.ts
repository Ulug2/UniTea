import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "../../../lib/supabase";

type Options = {
  onSuccess?: () => void;
};

export function useDeletePost(postId: string | null | undefined, options?: Options) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (overridePostId?: string) => {
      const id = overridePostId ?? postId;
      if (!id) throw new Error("Post ID is required");

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase configuration");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("You must be logged in to delete posts");

      const res = await fetch(`${supabaseUrl}/functions/v1/delete-post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ post_id: id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete post");
    },
    onSuccess: (_data, overridePostId) => {
      const id = overridePostId ?? postId;
      if (id) {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["post", id] });
        queryClient.invalidateQueries({ queryKey: ["user-posts"] });
        queryClient.invalidateQueries({ queryKey: ["user-post-comments"] });
        queryClient.invalidateQueries({ queryKey: ["user-post-votes"] });
        queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] });
      }
      if (postId && !overridePostId) router.back();
      options?.onSuccess?.();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete post. Please try again.";
      Alert.alert("Error", message);
    },
  });
}
