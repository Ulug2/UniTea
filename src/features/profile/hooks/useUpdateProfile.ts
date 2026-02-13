import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import type { Database } from "../../../types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type UpdateProfileInput = {
  username?: string;
  avatar_url?: string;
};

export function useUpdateProfile() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: UpdateProfileInput) => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) throw new Error("User ID missing");

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentUserId);

      if (error) throw error;
    },
    onMutate: async (updates: UpdateProfileInput) => {
      await queryClient.cancelQueries({ queryKey: ["current-user-profile"] });

      const previousProfile =
        queryClient.getQueryData<Profile | null>(["current-user-profile"]);

      if (previousProfile) {
        queryClient.setQueryData<Profile | null>(
          ["current-user-profile"],
          {
            ...previousProfile,
            ...updates,
          }
        );
      }

      return { previousProfile };
    },
    onSuccess: (_data, updates) => {
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      queryClient.invalidateQueries({ queryKey: ["chat-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["chat-users"] });
      queryClient.invalidateQueries({ queryKey: ["chat-other-user"] });

      const currentUserId = session?.user?.id;
      if (currentUserId) {
        queryClient.setQueryData<Profile | null>(
          ["current-user-profile"],
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
          ["current-user-profile"],
          context.previousProfile
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to update profile. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

