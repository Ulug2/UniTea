import { useMutation, UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { uploadImage } from "../utils/supabaseImages";
import { logger } from "../utils/logger";
import { Alert } from "react-native";

type CreatePostVariables = {
  imagePath: string | undefined;
  postContent: string;
  postLocation: string;
  postIsAnonymous: boolean;
  postCategory: "lost" | "found";
  pollOptions?: string[];
};

type CreatePostOptions = {
  isLostFound: boolean;
  repostId?: string | string[];
  currentUserId: string | null | undefined;
};

export function useCreatePostMutation(options: CreatePostOptions): UseMutationResult<any, unknown, CreatePostVariables> {
  const { isLostFound, repostId, currentUserId } = options;
  const queryClient = useQueryClient();

  const resolvedRepostId =
    typeof repostId === "string" ? repostId : Array.isArray(repostId) ? repostId[0] : undefined;

  return useMutation({
    mutationKey: ["create-post"],
    mutationFn: async (variables: CreatePostVariables) => {
      if (!currentUserId) {
        throw new Error("You must be logged in to create a post.");
      }

      const { postContent, postLocation, postIsAnonymous, postCategory, pollOptions, imagePath } =
        variables;

      if (!resolvedRepostId && !postContent.trim()) {
        throw new Error("Content is required");
      }

      if (isLostFound && !postLocation.trim()) {
        throw new Error("Location is required for lost & found posts");
      }

      const postPayload = {
        content: postContent.trim() || "",
        post_type: isLostFound ? "lost_found" : "feed",
        image_url: imagePath || null,
        is_anonymous: isLostFound ? false : postIsAnonymous,
        ...(isLostFound && {
          category: postCategory,
          location: postLocation.trim(),
        }),
        ...(resolvedRepostId && {
          reposted_from_post_id: resolvedRepostId,
        }),
        ...(!isLostFound &&
          pollOptions &&
          pollOptions.length >= 2 && {
            poll_options: pollOptions,
          }),
      };

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const functionUrl = `${supabaseUrl}/functions/v1/create-post`;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("You must be logged in to create a post.");
      }

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(postPayload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMessage =
          responseData?.error || responseData?.message || "Failed to create post";
        throw new Error(errorMessage);
      }

      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      if (!responseData || !responseData.id) {
        throw new Error("Invalid response from server");
      }

      return responseData;
    },
    onMutate: async (variables) => {
      if (isLostFound) return;

      await queryClient.cancelQueries({ queryKey: ["posts", "feed"] });
      const previousData = queryClient.getQueryData(["posts", "feed", "new"]);

      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();

      const optimisticPost = {
        post_id: tempId,
        user_id: currentUserId || "",
        content: variables.postContent.trim(),
        image_url: variables.imagePath || null,
        category: null,
        location: null,
        post_type: "feed",
        is_anonymous: variables.postIsAnonymous,
        is_deleted: false,
        is_edited: false,
        created_at: now,
        updated_at: now,
        edited_at: null,
        view_count: 0,
        username: variables.postIsAnonymous ? "Anonymous" : "You",
        avatar_url: null,
        is_verified: false,
        is_banned: false,
        comment_count: 0,
        vote_score: 0,
        user_vote: null,
        reposted_from_post_id: resolvedRepostId || null,
        repost_comment: resolvedRepostId ? variables.postContent.trim() : null,
        repost_count: 0,
        original_post_id: null,
        original_content: null,
        original_user_id: null,
        original_author_username: null,
        original_author_avatar: null,
        original_is_anonymous: null,
        original_created_at: null,
      };

      queryClient.setQueryData(["posts", "feed", "new"], (oldData: any) => {
        if (!oldData) {
          return {
            pages: [[optimisticPost]],
            pageParams: [0],
          };
        }

        const pages = Array.isArray(oldData.pages) ? oldData.pages : [];
        const newPages = pages.length
          ? [[optimisticPost, ...pages[0]], ...pages.slice(1)]
          : [[optimisticPost]];

        return {
          ...oldData,
          pages: newPages,
        };
      });

      return { previousData, tempId };
    },
    onError: (error, _variables, context) => {
      logger.error("Error creating post", error as Error);
      if (context?.previousData) {
        queryClient.setQueryData(["posts", "feed", "new"], context.previousData);
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to create post. Please try again.";
      Alert.alert("Error", message);
    },
    onSuccess: () => {
      if (isLostFound) {
        queryClient.invalidateQueries({ queryKey: ["posts", "lost_found"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
      }
    },
    onSettled: () => {
      if (!isLostFound) {
        queryClient.invalidateQueries({
          queryKey: ["posts", "feed"],
          refetchType: "none",
        });
      }
    },
  });
}

