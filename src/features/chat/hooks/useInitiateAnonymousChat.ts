import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { isRateLimitError } from "../../../utils/clientRateLimit";
import { logger } from "../../../utils/logger";

type InitiateParams = {
  postId: string;
  postAuthorId: string;
  /**
   * Whether the post was posted anonymously.
   *
   * - false → non-anonymous chat: 1-to-1 between users, shared across all
   *   non-anonymous posts. Canonical participant ordering (lower UUID = p1)
   *   prevents duplicate rows under concurrent taps.
   * - true  → post-scoped anonymous chat: one chat per (postId, initiator)
   *   pair so each anonymous post gets its own conversation.
   */
  isPostAnonymous: boolean;
};

type InitiateResult = {
  chatId: string;
};

export function useInitiateAnonymousChat() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  return useMutation<InitiateResult, Error, InitiateParams>({
    mutationFn: async ({ postId, postAuthorId, isPostAnonymous }) => {
      if (!currentUserId) throw new Error("Not authenticated");
      if (currentUserId === postAuthorId) {
        throw new Error("Cannot start a chat with yourself");
      }

      if (!isPostAnonymous) {
        // ── Non-anonymous: user-scoped chat ────────────────────────────────
        // Canonical ordering: smaller UUID is always participant_1 so the pair
        // is unique regardless of who initiates first (mirrors matchmaking).
        const [p1, p2] =
          currentUserId < postAuthorId
            ? [currentUserId, postAuthorId]
            : [postAuthorId, currentUserId];

        const { data: existing, error: selectErr } = await supabase
          .from("chats")
          .select("id")
          .eq("participant_1_id", p1)
          .eq("participant_2_id", p2)
          .eq("is_anonymous", false)
          .maybeSingle();

        if (selectErr && selectErr.code !== "PGRST116") throw selectErr;
        if (existing) return { chatId: existing.id };

        const { data: created, error: insertErr } = await supabase
          .from("chats")
          .insert({
            participant_1_id: p1,
            participant_2_id: p2,
            post_id: postId,
            initiator_id: currentUserId,
            is_anonymous: false,
            // last_message_at intentionally null until first message is sent.
          })
          .select("id")
          .single();

        if (insertErr) {
          if (insertErr.code === "23505") {
            const { data: dup, error: dupErr } = await supabase
              .from("chats")
              .select("id")
              .eq("participant_1_id", p1)
              .eq("participant_2_id", p2)
              .eq("is_anonymous", false)
              .single();
            if (dupErr) throw dupErr;
            return { chatId: dup.id };
          }
          throw insertErr;
        }

        return { chatId: created.id };
      }

      // ── Anonymous: post-scoped chat ─────────────────────────────────────
      // Each anonymous post gets its own conversation thread.
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
      logger.error("Failed to initiate chat", error, {
        userId: currentUserId,
        component: "useInitiateAnonymousChat",
      });
      if (isRateLimitError(error)) {
        Alert.alert(
          "Slow down",
          "You're starting too many chats. Please wait a moment before trying again.",
        );
      }
    },
  });
}
