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
      isSender,
      imageUrl,
    }: {
      messageId: string;
      action: DeleteAction;
      isSender: boolean;
      imageUrl?: string | null;
    }) => {
      if (!currentUserId) throw new Error("User not authenticated");

      if (action === "delete_for_everyone" && !isSender) {
        throw new Error("Only the sender can delete a message for everyone");
      }

      const update: { deleted_by_sender?: boolean; deleted_by_receiver?: boolean } = {};
      if (action === "delete_for_me") {
        if (isSender) update.deleted_by_sender = true;
        else update.deleted_by_receiver = true;
      } else {
        update.deleted_by_sender = true;
        update.deleted_by_receiver = true;
      }

      const { error } = await supabase
        .from("chat_messages")
        .update(update)
        .eq("id", messageId);

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

      const isCurrentUser = message.user_id === currentUserId;
      const deletedForEveryone = isDeletedForEveryone(message);

      const options: string[] = [];
      const actions: Array<() => void> = [];

      const doDeleteForMe = () => {
        deleteForMe(message.id, isCurrentUser);
      };

      // "Reply" is shown for all non-tombstone messages
      if (!deletedForEveryone) {
        options.push("Reply");
        actions.push(() => onReply?.(message));
      }

      if (isCurrentUser && !deletedForEveryone) {
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
      } else if (!deletedForEveryone) {
        // Partner message: allow delete-for-me only.
        options.push("Delete for me", "Cancel");
        actions.push(doDeleteForMe, () => { });
      } else {
        // Tombstone: only Cancel (and maybe Reply, already added above).
        options.push("Cancel");
        actions.push(() => { });
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
