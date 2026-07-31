import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";

export function useUnblockAll() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) throw new Error("User ID missing");

      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", currentUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) return;

      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      // Broad by necessity (unblocking can affect content across Campus,
      // every community, and Lost & Found — there's no single community to
      // scope to), but lazy: don't force every mounted feed to refetch
      // immediately. Matches useBlockUser's established pattern.
      queryClient.invalidateQueries({ queryKey: ["posts"], refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["chat-summaries", currentUserId] });
      queryClient.invalidateQueries({ queryKey: ["global-unread-count", currentUserId] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to unblock users. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

