import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { logger } from "../../../utils/logger";
import type { CommentNode } from "../utils/tree";

type CreateCommentInput = {
  content: string;
  parentId: string | null;
  isAnonymous: boolean;
};

type UseCreateCommentOptions = {
  postId: string | null | undefined;
  viewerId: string | null;
};

export function useCreateComment({ postId, viewerId }: UseCreateCommentOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ content, parentId, isAnonymous }: CreateCommentInput) => {
      if (!viewerId) {
        throw new Error("You must be logged in to post a comment");
      }
      if (!postId) {
        throw new Error("Post ID is required");
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const functionUrl = `${supabaseUrl}/functions/v1/create-comment`;

      // Refresh session so the token is valid (fixes "Unauthorized" on simulator / stale tokens)
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();
      const session =
        refreshData?.session ?? (await supabase.auth.getSession()).data?.session;

      if (refreshError) {
        logger.error("Session refresh failed", refreshError);
        throw new Error("Session expired. Please sign in again.");
      }
      if (!session?.access_token) {
        throw new Error("You must be logged in to post a comment.");
      }

      const safeParentId =
        parentId && !parentId.startsWith("temp-") ? parentId : null;

      const commentPayload = {
        content: content.trim(),
        post_id: postId,
        parent_comment_id: safeParentId,
        is_anonymous: isAnonymous,
      };

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(commentPayload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const rawMessage =
          responseData?.error || responseData?.message || "Failed to create comment";
        const errorMessage =
          rawMessage === "Unauthorized"
            ? "Session expired or invalid. Please sign in again."
            : rawMessage;
        throw new Error(errorMessage);
      }

      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      if (!responseData || !responseData.id) {
        throw new Error("Invalid response from server");
      }

      return responseData as CommentNode;
    },
    onError: (error: unknown) => {
      logger.error("Error posting comment", error as Error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to post comment. Please try again.";

      let errorMessage = message;
      if (message.includes("rate limit")) {
        errorMessage = "You're posting too fast. Please wait a moment.";
      } else if (message.includes("network") || message.includes("timeout")) {
        errorMessage = "Network error. Please check your connection.";
      }

      Alert.alert("Error", errorMessage);
    },
    onSuccess: async (newComment: CommentNode) => {
      if (!viewerId || !postId) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", viewerId)
        .single();

      // Preserve post_specific_anon_id from server so anonymous comments show "User #" immediately.
      // Requires: DB column post_specific_anon_id and create-comment edge function that sets it.
      const entry: CommentNode = {
        ...newComment,
        user: profile ?? undefined,
        score: 0,
        replies: [],
        post_specific_anon_id:
          newComment.post_specific_anon_id ?? (newComment as any).post_specific_anon_id,
      };

      queryClient.setQueryData<CommentNode[]>(
        ["comments", postId, viewerId],
        (old) => [...(old ?? []), entry]
      );

      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({
        queryKey: ["posts", "feed"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["user-posts", viewerId],
        refetchType: "none",
      });

      queryClient.refetchQueries({
        queryKey: ["comments", postId, viewerId],
      });
    },
  });
}

