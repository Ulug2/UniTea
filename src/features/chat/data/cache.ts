import type { QueryClient } from "@tanstack/react-query";
import type { ChatMessageVM, MessagesQueryData } from "../types";

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
