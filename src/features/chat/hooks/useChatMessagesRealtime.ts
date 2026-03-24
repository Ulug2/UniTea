import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { prependIncomingMessage, upsertIncomingMessage } from "../data/cache";
import { subscribeToChatMessages } from "../data/realtime";

type BlockRecord = {
  userId: string;
  scope: "anonymous_only" | "profile_only";
};

function isBlockedDirectMessage(
  blocks: BlockRecord[],
  otherUserId: string | null | undefined
): boolean {
  if (!otherUserId) return false;
  return blocks.some(
    (b) => b.userId === otherUserId && b.scope === "profile_only"
  );
}

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

    const unsubscribe = subscribeToChatMessages(chatId, {
      onRawInsert: (newMessage) => {
        if (!isMounted) return;

        if (newMessage.user_id === currentUserId) return;
        if (newMessage.chat_id !== chatId) return;
        if (pendingMessageIdsRef.current.has(newMessage.id)) return;

        const cachedBlocks =
          queryClient.getQueryData<BlockRecord[]>(["blocks", currentUserId]) ||
          [];
        if (isBlockedDirectMessage(cachedBlocks, newMessage.user_id)) return;

        // Only dedupe/trigger UI updates for the initial raw INSERT.
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
      },
      onEnrichedInsert: (enrichedMessage) => {
        // Enrichment is a secondary update to an already-received message.
        // It must not trigger scroll/pill UI or unread invalidations.
        if (!isMounted) return;
        const cachedBlocks =
          queryClient.getQueryData<BlockRecord[]>(["blocks", currentUserId]) ||
          [];
        if (isBlockedDirectMessage(cachedBlocks, enrichedMessage.user_id)) return;
        upsertIncomingMessage(queryClient, chatId, enrichedMessage);
      },
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
