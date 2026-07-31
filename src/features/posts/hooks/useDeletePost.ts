import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { feedKeys } from "../../communities/data/queryKeys";

/**
 * Explicit, discriminated invalidation scope for the deleted post. Required
 * (not inferred) because a feed post with communityId === null (Campus Feed)
 * is not distinguishable by value alone from "this is a Lost & Found post" —
 * the two live in structurally different cache entries
 * (feedKeys.list(...) vs. ["posts","lost_found",universityId]), and
 * feedKeys.belongsToCommunity's predicate only ever matches the former.
 */
export type DeletePostScope =
  | { type: "feed"; communityId: string | null }
  | { type: "lost_found"; universityId: string | null | undefined };

type Options = {
  scope: DeletePostScope;
  onSuccess?: () => void;
  /** If set, called instead of `router.back()` after delete (e.g. custom Android exit animation). */
  onNavigateBack?: () => void;
};

export function useDeletePost(postId: string | null | undefined, options: Options) {
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
        if (options.scope.type === "feed") {
          queryClient.invalidateQueries({
            predicate: feedKeys.belongsToCommunity(options.scope.communityId),
          });
        } else {
          queryClient.invalidateQueries({
            queryKey: ["posts", "lost_found", options.scope.universityId],
          });
        }
        queryClient.invalidateQueries({ queryKey: ["post", id] });
        queryClient.invalidateQueries({ queryKey: ["user-posts"] });
        queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] });
      }
      if (postId && !overridePostId) {
        if (options.onNavigateBack) {
          options.onNavigateBack();
        } else {
          router.back();
        }
      }
      options.onSuccess?.();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete post. Please try again.";
      Alert.alert("Error", message);
    },
  });
}
