import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { BlockScope } from "../../../hooks/useBlocks";

type BlockUserParams = {
  targetUserId: string;
  scope: BlockScope;
};

export function useBlockUser(viewerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId, scope }: BlockUserParams) => {
      if (!viewerId) throw new Error("User ID missing");

      const { error } = await supabase.from("blocks").insert({
        blocker_id: viewerId,
        blocked_id: targetUserId,
        block_scope: scope,
      });

      if (error) {
        if (error.code === "23505") return; // already blocked
        throw error;
      }
    },
    onSuccess: () => {
      if (!viewerId) return;

      // Invalidate the blocks cache immediately so filtering updates
      queryClient.invalidateQueries({ queryKey: ["blocks", viewerId] });

      // Mark posts/comments as stale but don't refetch immediately —
      // this avoids triggering heavy re-renders during navigation animations
      queryClient.invalidateQueries({ queryKey: ["posts"], refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: ["comments"], refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: ["post"], refetchType: "none" });

      // Chat-related: refetch so blocked chats disappear promptly
      queryClient.invalidateQueries({ queryKey: ["chat-summaries", viewerId] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["global-unread-count", viewerId] });
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
