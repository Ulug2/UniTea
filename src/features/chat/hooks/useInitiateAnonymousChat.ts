import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { logger } from "../../../utils/logger";

type InitiateParams = {
  postId: string;
  postAuthorId: string;
};

type InitiateResult = {
  chatId: string;
};

export function useInitiateAnonymousChat() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  return useMutation<InitiateResult, Error, InitiateParams>({
    mutationFn: async ({ postId, postAuthorId }) => {
      if (!currentUserId) throw new Error("Not authenticated");
      if (currentUserId === postAuthorId) {
        throw new Error("Cannot start anonymous chat with yourself");
      }

      const { data: existing, error: selectErr } = await supabase
        .from("chats")
        .select("id")
        .eq("post_id", postId)
        .eq("initiator_id", currentUserId)
        .eq("is_anonymous", true)
        .maybeSingle();

      if (selectErr && selectErr.code !== "PGRST116") throw selectErr;
      if (existing) return { chatId: existing.id };

      const { data: created, error: insertErr } = await supabase
        .from("chats")
        .insert({
          participant_1_id: currentUserId,
          participant_2_id: postAuthorId,
          post_id: postId,
          initiator_id: currentUserId,
          is_anonymous: true,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          const { data: dup, error: dupErr } = await supabase
            .from("chats")
            .select("id")
            .eq("post_id", postId)
            .eq("initiator_id", currentUserId)
            .eq("is_anonymous", true)
            .single();
          if (dupErr) throw dupErr;
          return { chatId: dup.id };
        }
        throw insertErr;
      }

      return { chatId: created.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries", currentUserId],
        refetchType: "none",
      });
    },
    onError: (error) => {
      logger.error("Failed to initiate anonymous chat", error, {
        userId: currentUserId,
        component: "useInitiateAnonymousChat",
      });
    },
  });
}
