import type { QueryClient } from "@tanstack/react-query";
import type { ChatMessageVM, MessagesQueryData } from "../types";
import { isDeletedForEveryone, isDeletedForViewer, deletedLabel } from "../types";

const MESSAGES_QUERY_KEY = "chat-messages";

/**
 * Pure helper: prepend a message to the first page (newest). Used by realtime and optimistic.
 */
export function prependMessage(
  oldData: MessagesQueryData | undefined,
  newMessage: ChatMessageVM
): MessagesQueryData {
  if (!oldData) {
    return {
      pages: [[newMessage]],
      pageParams: [0],
    };
  }
  const safePages = Array.isArray(oldData.pages) ? oldData.pages : [[]];
  const newPages = safePages.map((page, index) =>
    index === 0 && Array.isArray(page) ? [newMessage, ...page] : [...page]
  );
  if (!newPages[0]?.length) newPages[0] = [newMessage];
  return {
    ...oldData,
    pages: newPages,
    pageParams: oldData.pageParams ?? [0],
  };
}

export function addOptimisticMessage(
  queryClient: QueryClient,
  chatId: string,
  optimisticMessage: ChatMessageVM
): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => prependMessage(old, optimisticMessage)
  );
}

export function replaceOptimisticMessage(
  queryClient: QueryClient,
  chatId: string,
  tempId: string,
  confirmedMessage: ChatMessageVM
): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.map((msg) =>
            msg.id === tempId
              ? {
                ...confirmedMessage,
                sendStatus: undefined,
                _clientPayload: undefined,
              }
              : msg
          )
        ),
      };
    }
  );
}

export function markMessageFailed(
  queryClient: QueryClient,
  chatId: string,
  tempId: string
): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.map((msg) =>
            msg.id === tempId ? { ...msg, sendStatus: "failed" as const } : msg
          )
        ),
      };
    }
  );
}

/**
 * Remove an optimistic/failed message by id (e.g. before retry).
 */
export function removeOptimisticMessage(
  queryClient: QueryClient,
  chatId: string,
  messageId: string
): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.filter((msg) => msg.id !== messageId)
        ),
      };
    }
  );
}

export function prependIncomingMessage(
  queryClient: QueryClient,
  chatId: string,
  newMessage: ChatMessageVM
): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => {
      if (!old) return prependMessage(old, newMessage);
      const exists = old.pages.some((page) =>
        page.some((m) => m.id === newMessage.id)
      );
      if (exists) return old;
      return prependMessage(old, newMessage);
    }
  );
}

/**
 * Find the latest *visible* message for a given viewer in the paginated data.
 * Skips messages that are delete-for-me for the viewer.
 */
export function getLatestMessage(
  data: MessagesQueryData | undefined,
  viewerId: string
): ChatMessageVM | null {
  if (!data || !Array.isArray(data.pages)) return null;

  let latest: ChatMessageVM | null = null;
  let latestTime = -Infinity;

  for (const page of data.pages) {
    if (!Array.isArray(page)) continue;
    for (const msg of page) {
      if (!msg) continue;
      const hiddenForViewer = isDeletedForViewer(msg, viewerId);
      const tombstone = isDeletedForEveryone(msg);
      // Skip delete-for-me messages, but keep delete-for-everyone tombstones visible.
      if (hiddenForViewer && !tombstone) continue;
      const createdAt = msg.created_at ? new Date(msg.created_at).getTime() : 0;
      if (createdAt >= latestTime) {
        latestTime = createdAt;
        latest = msg;
      }
    }
  }

  return latest;
}

/**
 * Sync the chat summaries cache for a single chat from its messages cache.
 *
 * This mirrors the optimistic update logic in useChatSendMessage, ensuring that
 * deletions (for-me or for-everyone) are reflected in the chat list's
 * last_message_* fields without requiring an immediate refetch.
 */
export function updateChatSummaryFromMessages(
  queryClient: QueryClient,
  chatId: string,
  currentUserId: string
): void {
  const messages = queryClient.getQueryData<MessagesQueryData>([
    MESSAGES_QUERY_KEY,
    chatId,
  ]);
  // If the messages query hasn't been populated yet (cold start / still loading),
  // do not patch the chat list. Treating this as "no messages" would temporarily
  // remove the row from the list (it filters by last_message_at) and cause a
  // visible flicker on first navigation.
  if (!messages) return;
  const latest = getLatestMessage(messages, currentUserId);

  queryClient.setQueryData<unknown[]>(
    ["chat-summaries", currentUserId],
    (oldSummaries: unknown[] | undefined) => {
      if (!oldSummaries || !Array.isArray(oldSummaries)) {
        return oldSummaries ?? [];
      }

      let updated = false;
      const next = oldSummaries.map((summary: unknown) => {
        const s = summary as {
          chat_id?: string;
          participant_1_id?: string | null;
          participant_2_id?: string | null;
          last_message_content_p1?: string | null;
          last_message_has_image_p1?: boolean | null;
          last_message_content_p2?: string | null;
          last_message_has_image_p2?: boolean | null;
          last_message_at?: string | null;
        };

        if (s.chat_id !== chatId) return summary;

        updated = true;

        const isP1 = s.participant_1_id === currentUserId;

        if (!latest) {
          // No remaining visible messages: treat chat as having no last message
          // so it will be filtered out by the chat list.
          return {
            ...s,
            last_message_content_p1: isP1 ? null : s.last_message_content_p1 ?? null,
            last_message_has_image_p1: isP1 ? false : s.last_message_has_image_p1 ?? false,
            last_message_content_p2: !isP1 ? null : s.last_message_content_p2 ?? null,
            last_message_has_image_p2: !isP1 ? false : s.last_message_has_image_p2 ?? false,
            last_message_at: null,
          };
        }

        const isTombstone = isDeletedForEveryone(latest);
        if (isTombstone) {
          const isSender = latest.user_id === currentUserId;
          const tombstoneText = isSender
            ? "You deleted this message."
            : deletedLabel(latest);
          // Match the detail view: show a deleted-message label and never treat
          // tombstones as image messages in the chat list.
          if (isP1) {
            return {
              ...s,
              last_message_content_p1: tombstoneText,
              last_message_has_image_p1: false,
              last_message_at: latest.created_at ?? null,
            };
          }
          return {
            ...s,
            last_message_content_p2: tombstoneText,
            last_message_has_image_p2: false,
            last_message_at: latest.created_at ?? null,
          };
        }

        const hasImage =
          !!latest.image_url && String(latest.image_url).trim() !== "";

        if (isP1) {
          return {
            ...s,
            last_message_content_p1: latest.content ?? null,
            last_message_has_image_p1: hasImage,
            last_message_at: latest.created_at ?? null,
          };
        }
        return {
          ...s,
          last_message_content_p2: latest.content ?? null,
          last_message_has_image_p2: hasImage,
          last_message_at: latest.created_at ?? null,
        };
      });

      return updated ? next : oldSummaries;
    }
  );
}

export type ApplyMessageDeletionParams = {
  queryClient: QueryClient;
  chatId: string;
  messageId: string;
  action: "delete_for_me" | "delete_for_everyone";
  isSender: boolean;
};

export function applyMessageDeletion({
  queryClient,
  chatId,
  messageId,
  action,
  isSender,
}: ApplyMessageDeletionParams): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => {
      if (!old) return old;
      if (action === "delete_for_me") {
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.filter((msg) => msg.id !== messageId)
          ),
        };
      }
      // delete_for_everyone: show tombstone
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.map((msg) =>
            msg.id === messageId
              ? {
                ...msg,
                content: "This message was deleted",
                deleted_by_sender: true,
                deleted_by_receiver: true,
              }
              : msg
          )
        ),
      };
    }
  );
}
