import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "../../../lib/supabase";

export function useBlockUser(viewerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!viewerId) throw new Error("User ID missing");

      const { error } = await supabase.from("blocks").insert({
        blocker_id: viewerId,
        blocked_id: targetUserId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      if (!viewerId) return;

      queryClient.invalidateQueries({ queryKey: ["blocks", viewerId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries", viewerId],
      });
      queryClient.invalidateQueries({ queryKey: ["post"] });

      router.back();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to block user. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

