import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { checkClientRateLimit, isRateLimitError } from "../../../utils/clientRateLimit";
import type { Database } from "../../../types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type UpdateProfileInput = {
  username?: string;
  avatar_url?: string | null;
};

export function useUpdateProfile() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: UpdateProfileInput) => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) throw new Error("User ID missing");

      await checkClientRateLimit(`profile:update:${currentUserId}`, 10, 3600);

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentUserId);

      if (error) {
        // Phase 7.6.1: map the DB's format/uniqueness guards
        // (profiles_username_format_check / idx_profiles_username_unique_ci)
        // to messages a user can act on, instead of a raw Postgres string.
        if (error.code === "23505") {
          throw new Error("That username is already taken. Please choose another.");
        }
        if (error.code === "23514") {
          throw new Error(
            "Username must be 3-20 characters, using only letters, numbers, and underscores.",
          );
        }
        throw error;
      }
    },
    onMutate: async (updates: UpdateProfileInput) => {
      // Must match useMyProfile's exact key (["current-user-profile", userId])
      // — get/setQueryData require an exact match, not just a prefix, so a
      // bare ["current-user-profile"] here silently wrote to/read from a
      // cache entry the UI never reads, and this optimistic update never
      // actually took effect (only the invalidateQueries below did, since
      // invalidation defaults to prefix matching).
      await queryClient.cancelQueries({ queryKey: ["current-user-profile", session?.user?.id] });

      const previousProfile =
        queryClient.getQueryData<Profile | null>(["current-user-profile", session?.user?.id]);

      if (previousProfile) {
        queryClient.setQueryData<Profile | null>(
          ["current-user-profile", session?.user?.id],
          {
            ...previousProfile,
            ...updates,
          }
        );
      }

      return { previousProfile };
    },
    onSuccess: (_data, updates) => {
      queryClient.invalidateQueries({ queryKey: ["current-user-profile", session?.user?.id] });
      // Only invalidate heavy feed / post-list queries when the avatar changes
      // (set OR cleared — "avatar_url" in updates covers both). Username-only
      // changes do not need to bust the feed cache and would otherwise cause
      // scroll-position jumps on the profile posts list on iOS.
      if ("avatar_url" in updates) {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      }
      queryClient.invalidateQueries({ queryKey: ["chat-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["chat-users"] });
      queryClient.invalidateQueries({ queryKey: ["chat-other-user"] });

      const currentUserId = session?.user?.id;
      if (currentUserId) {
        queryClient.setQueryData<Profile | null>(
          ["current-user-profile", session?.user?.id],
          (old) => {
            if (!old) return old;
            return { ...old, ...updates };
          }
        );
      }
    },
    onError: (error, _updates, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(
          ["current-user-profile", session?.user?.id],
          context.previousProfile
        );
      }

      if (isRateLimitError(error)) {
        Alert.alert("Slow down", "You're updating your profile too quickly. Please wait a moment.");
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update profile. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

