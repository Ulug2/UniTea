import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQueryClient, QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import {
  prependIncomingMessage,
  upsertIncomingMessage,
  applyIncomingMessageUpdate,
} from "../data/cache";
import { subscribeToChatMessages } from "../data/realtime";
import type { ChatMessageVM, MessagesQueryData } from "../types";

/**
 * A raw realtime insert never carries the joined `replyToMessage` snapshot
 * (postgres_changes has no JOIN capability, and the anonymous broadcast
 * payload is deliberately flat too — see data/realtime.ts). Without this,
 * the bubble briefly renders with reply_to_id set but no reply content,
 * showing the "(Original message)" placeholder until the separate
 * enrichment SELECT resolves a moment later.
 *
 * If the replied-to message is already sitting in this chat's own cache
 * (true whenever the recipient is actively viewing the conversation, which
 * is the common case), attach it immediately so the bubble never flashes
 * the placeholder. This is a synchronous cache read, not a fetch — the
 * enrichment SELECT in data/realtime.ts still runs afterward and its
 * result still overwrites this snapshot via upsertIncomingMessage, so it
 * remains the authoritative source; this only removes the visible gap
 * before it resolves.
 */
function withCachedReplyPreview(
  queryClient: QueryClient,
  chatId: string,
  message: ChatMessageVM
): ChatMessageVM {
  if (!message.reply_to_id || message.replyToMessage) return message;

  const cached = queryClient.getQueryData<MessagesQueryData>([
    "chat-messages",
    chatId,
  ]);
  const original = cached?.pages
    .flat()
    .find((m) => m?.id === message.reply_to_id);
  if (!original) return message;

  return {
    ...message,
    replyToMessage: {
      id: original.id,
      content: original.content ?? null,
      image_url: original.image_url ?? null,
      user_id: original.user_id,
      deleted_by_sender: original.deleted_by_sender,
      deleted_by_receiver: original.deleted_by_receiver,
    },
  };
}

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
  isAnonymous: boolean,
  options: Options
): void {
  const queryClient = useQueryClient();
  const { pendingMessageIdsRef, onIncomingMessage } = options;
  const onIncomingMessageRef = useRef(onIncomingMessage);
  onIncomingMessageRef.current = onIncomingMessage;

  useEffect(() => {
    if (!chatId || !currentUserId) return;

    let isMounted = true;

    const unsubscribe = subscribeToChatMessages(
      chatId,
      currentUserId,
      isAnonymous,
      {
        onRawInsert: (newMessage) => {
          if (!isMounted) return;

          // For anonymous chats, receipt on this user's own private topic
          // already guarantees "not mine" and "not from someone I've
          // blocked" (both enforced server-side — see data/realtime.ts).
          // For non-anonymous chats, keep the existing client-side checks
          // exactly as before.
          if (!isAnonymous) {
            if (newMessage.user_id === currentUserId) return;
            if (newMessage.chat_id !== chatId) return;

            const cachedBlocks =
              queryClient.getQueryData<BlockRecord[]>([
                "blocks",
                currentUserId,
              ]) || [];
            if (isBlockedDirectMessage(cachedBlocks, newMessage.user_id))
              return;
          }
          if (pendingMessageIdsRef.current.has(newMessage.id)) return;

          // Only dedupe/trigger UI updates for the initial raw INSERT.
          pendingMessageIdsRef.current.add(newMessage.id);
          setTimeout(() => {
            pendingMessageIdsRef.current.delete(newMessage.id);
          }, PENDING_CLEANUP_MS);

          prependIncomingMessage(
            queryClient,
            chatId,
            withCachedReplyPreview(queryClient, chatId, newMessage)
          );
          onIncomingMessageRef.current?.();

          // User is actively viewing this chat — mark the message read
          // immediately so the server-side unread count stays at zero
          // without waiting for the chat detail screen's markAsRead timer.
          // Anonymous chats route through the RPC (Phase 4): a plain
          // base-table UPDATE can't locate the row for them (Phase 1).
          if (isAnonymous) {
            (supabase as any)
              .rpc("mark_anonymous_chat_read", { p_chat_id: chatId })
              .then(({ error }: { error: unknown }) => {
                if (error) {
                  queryClient.invalidateQueries({
                    queryKey: ["global-unread-count", currentUserId],
                    refetchType: "none",
                  });
                }
              });
          } else {
            supabase
              .from("chat_messages")
              .update({ is_read: true })
              .eq("id", newMessage.id)
              .then(({ error }) => {
                if (error) {
                  // Non-critical: the chat detail screen's markAsRead will reconcile
                  // on the next unread-count change.
                  queryClient.invalidateQueries({
                    queryKey: ["global-unread-count", currentUserId],
                    refetchType: "none",
                  });
                }
              });
          }
        },
        onEnrichedInsert: (enrichedMessage) => {
          // Enrichment is a secondary update to an already-received message.
          // It must not trigger scroll/pill UI or unread invalidations.
          if (!isMounted) return;
          if (!isAnonymous) {
            const cachedBlocks =
              queryClient.getQueryData<BlockRecord[]>([
                "blocks",
                currentUserId,
              ]) || [];
            if (isBlockedDirectMessage(cachedBlocks, enrichedMessage.user_id))
              return;
          }
          upsertIncomingMessage(queryClient, chatId, enrichedMessage);
        },
        onMessageUpdate: (update) => {
          // Deletion-state changes only, currently. No block check needed:
          // for anonymous chats the server already gates this broadcast
          // (see the migration); for non-anonymous chats the message is
          // already in the cache or this is a no-op either way, and
          // selectMessages' existing render-time block filter applies
          // regardless of these flags. No scroll/pill/read-marking side
          // effects — a deletion isn't new content.
          if (!isMounted) return;
          applyIncomingMessageUpdate(queryClient, chatId, update);
        },
      }
    );

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
  }, [chatId, currentUserId, isAnonymous, queryClient, pendingMessageIdsRef]);
}
