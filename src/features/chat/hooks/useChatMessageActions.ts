import { useCallback } from "react";
import { Alert, Platform, ActionSheetIOS } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { logger } from "../../../utils/logger";
import type { ChatMessageVM, DeleteAction } from "../types";
import { isDeletedForEveryone } from "../types";
import { applyMessageDeletion } from "../data/cache";
import type { MessagesQueryData } from "../types";

const MESSAGES_QUERY_KEY = "chat-messages";

export function useChatMessageActions(chatId: string, currentUserId: string | undefined) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async ({
      messageId,
      action,
      isSender,
    }: {
      messageId: string;
      action: DeleteAction;
      isSender: boolean;
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
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: [MESSAGES_QUERY_KEY, chatId] });
      const previousData = queryClient.getQueryData<MessagesQueryData>([
        MESSAGES_QUERY_KEY,
        chatId,
      ]);

      applyMessageDeletion({
        queryClient,
        chatId,
        messageId: variables.messageId,
        action: variables.action,
        isSender: variables.isSender,
      });

      return { previousData };
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
    (messageId: string) => {
      deleteMutation.mutate({
        messageId,
        action: "delete_for_everyone",
        isSender: true,
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

      if (isCurrentUser && !deletedForEveryone) {
        options.push("Delete for me", "Delete for everyone", "Cancel");
        actions.push(
          doDeleteForMe,
          () =>
            deleteMutation.mutate({
              messageId: message.id,
              action: "delete_for_everyone",
              isSender: true,
            }),
          () => {}
        );
      } else {
        options.push("Delete for me", "Cancel");
        actions.push(doDeleteForMe, () => {});
      }

      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            destructiveButtonIndex: options.indexOf("Delete for everyone"),
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
        Alert.alert("Delete message", undefined, androidButtons);
      }
    },
    [currentUserId, deleteMutation]
  );

  return { deleteForMe, deleteForEveryone, openMessageActionSheet };
}
