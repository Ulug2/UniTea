import { useCallback } from "react";
import { Alert, Platform, ActionSheetIOS } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { logger } from "../../../utils/logger";
import type { ChatMessageVM, DeleteAction } from "../types";
import { isDeletedForEveryone } from "../types";
import { applyMessageDeletion, updateChatSummaryFromMessages } from "../data/cache";
import type { MessagesQueryData } from "../types";

const MESSAGES_QUERY_KEY = "chat-messages";

type ChatMessageActionsOptions = {
  onReply?: (message: ChatMessageVM) => void;
};

export function useChatMessageActions(
  chatId: string,
  currentUserId: string | undefined,
  options?: ChatMessageActionsOptions
) {
  const queryClient = useQueryClient();
  const { onReply } = options ?? {};

  const deleteMutation = useMutation({
    mutationFn: async ({
      messageId,
      action,
      imageUrl,
    }: {
      messageId: string;
      action: DeleteAction;
      isSender: boolean;
      imageUrl?: string | null;
    }) => {
      if (!currentUserId) throw new Error("User not authenticated");

      // Single entry point for both chat types and both delete actions —
      // the RPC re-derives sender/participancy/anonymity server-side and
      // is the actual source of truth for "only the sender may delete for
      // everyone" (direct-table UPDATE access to the deletion-flag columns
      // is revoked from clients; see 20260728000000_unify_chat_message_deletion_rpc.sql).
      const { error } = await (supabase as any).rpc(
        "set_chat_message_deletion",
        { p_message_id: messageId, p_action: action }
      );
      if (error) throw error;

      // When a message is deleted for everyone neither party can see it, so the
      // image file is no longer needed. Delete it from storage (non-fatal).
      if (action === "delete_for_everyone" && imageUrl) {
        const { error: storageError } = await supabase.storage
          .from("chat-images")
          .remove([imageUrl]);
        if (storageError) {
          logger.warn("useChatMessageActions: failed to delete chat image from storage", storageError);
        }
      }
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: [MESSAGES_QUERY_KEY, chatId] });
      const previousData = queryClient.getQueryData<MessagesQueryData>([
        MESSAGES_QUERY_KEY,
        chatId,
      ]);
      const previousSummaries = currentUserId
        ? queryClient.getQueryData<unknown[]>(["chat-summaries", currentUserId])
        : undefined;

      applyMessageDeletion({
        queryClient,
        chatId,
        messageId: variables.messageId,
        action: variables.action,
        isSender: variables.isSender,
      });

      if (currentUserId) {
        updateChatSummaryFromMessages(queryClient, chatId, currentUserId);
      }

      return { previousData, previousSummaries };
    },
    onError: (error, _variables, context) => {
      logger.error("Error deleting message", error, {
        userId: currentUserId,
        chatId,
        operation: "deleteMessage",
      });
      if (context?.previousData) {
        queryClient.setQueryData([MESSAGES_QUERY_KEY, chatId], context.previousData);
      }
      if (currentUserId && context?.previousSummaries) {
        queryClient.setQueryData(
          ["chat-summaries", currentUserId],
          context.previousSummaries
        );
      }
      Alert.alert("Error", "Failed to delete message. Please try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [MESSAGES_QUERY_KEY, chatId] });
    },
  });

  const deleteForMe = useCallback(
    (messageId: string, isSender: boolean) => {
      if (!currentUserId) return;
      deleteMutation.mutate({
        messageId,
        action: "delete_for_me",
        isSender,
      });
    },
    [currentUserId, deleteMutation]
  );

  const deleteForEveryone = useCallback(
    (messageId: string, imageUrl?: string | null) => {
      deleteMutation.mutate({
        messageId,
        action: "delete_for_everyone",
        isSender: true,
        imageUrl,
      });
    },
    [deleteMutation]
  );

  const openMessageActionSheet = useCallback(
    (message: ChatMessageVM) => {
      if (!currentUserId) return;

      // A tombstone has no available actions (can't reply to or delete an
      // already-deleted message), so show no sheet/alert at all rather than
      // a modal offering only "Cancel".
      if (isDeletedForEveryone(message)) return;

      const isCurrentUser = message.user_id === currentUserId;

      const options: string[] = ["Reply"];
      const actions: Array<() => void> = [() => onReply?.(message)];

      const doDeleteForMe = () => {
        deleteForMe(message.id, isCurrentUser);
      };

      if (isCurrentUser) {
        // New rule: deleting your own message always deletes for everyone.
        options.push("Delete for everyone", "Cancel");
        actions.push(
          () =>
            deleteMutation.mutate({
              messageId: message.id,
              action: "delete_for_everyone",
              isSender: true,
              imageUrl: message.image_url,
            }),
          () => { }
        );
      } else {
        // Partner message: allow delete-for-me only.
        options.push("Delete for me", "Cancel");
        actions.push(doDeleteForMe, () => { });
      }

      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            destructiveButtonIndex: options.indexOf("Delete for everyone") >= 0
              ? options.indexOf("Delete for everyone")
              : undefined,
            cancelButtonIndex: options.indexOf("Cancel"),
          },
          (buttonIndex) => {
            const action = actions[buttonIndex];
            if (action) action();
          }
        );
      } else {
        const androidButtons = options.map((label, idx) => {
          if (label === "Cancel") {
            return { text: "Cancel", style: "cancel" as const };
          }
          const onPress = actions[idx];
          return { text: label, onPress };
        });
        Alert.alert("Message", undefined, androidButtons);
      }
    },
    [currentUserId, deleteMutation, onReply]
  );

  return { deleteForMe, deleteForEveryone, openMessageActionSheet };
}
