import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { prependIncomingMessage } from "../data/cache";
import { subscribeToChatMessages } from "../data/realtime";

type Options = {
  pendingMessageIdsRef: React.MutableRefObject<Set<string>>;
  onIncomingMessage?: () => void;
};

const PENDING_CLEANUP_MS = 5000;

export function useChatMessagesRealtime(
  chatId: string,
  currentUserId: string | undefined,
  options: Options
): void {
  const queryClient = useQueryClient();
  const { pendingMessageIdsRef, onIncomingMessage } = options;
  const onIncomingMessageRef = useRef(onIncomingMessage);
  onIncomingMessageRef.current = onIncomingMessage;

  useEffect(() => {
    if (!chatId || !currentUserId) return;

    let isMounted = true;

    const unsubscribe = subscribeToChatMessages(chatId, (newMessage) => {
      if (!isMounted) return;

      if (newMessage.user_id === currentUserId) return;
      if (newMessage.chat_id !== chatId) return;
      if (pendingMessageIdsRef.current.has(newMessage.id)) return;

      pendingMessageIdsRef.current.add(newMessage.id);
      setTimeout(() => {
        pendingMessageIdsRef.current.delete(newMessage.id);
      }, PENDING_CLEANUP_MS);

      prependIncomingMessage(queryClient, chatId, newMessage);
      onIncomingMessageRef.current?.();

      queryClient.invalidateQueries({
        queryKey: ["global-unread-count", currentUserId],
        refetchType: "none",
      });
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active" && isMounted && chatId && currentUserId) {
          setTimeout(() => {
            if (isMounted) {
              queryClient.invalidateQueries({
                queryKey: ["chat-messages", chatId],
                refetchType: "active",
              });
            }
          }, 1000);
        }
      }
    );

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [chatId, currentUserId, queryClient, pendingMessageIdsRef]);
}
