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
      // Real-time INSERTs are always for the newest message, so it should be
      // on the first page. Checking only page[0] avoids scanning the entire
      // infinite list on every insert.
      const firstPage = Array.isArray(old.pages?.[0]) ? old.pages[0] : [];
      const exists = firstPage.some((m) => m?.id === newMessage.id);
      if (exists) return old;
      return prependMessage(old, newMessage);
    }
  );
}

/**
 * Upsert an incoming message into the paginated cache.
 *
 * Used for enrichment updates (e.g. `replyToMessage`) after an initial raw
 * INSERT was already prepended. The raw insert may already carry a
 * best-effort `replyToMessage` snapshot sourced from the local cache (see
 * useChatMessagesRealtime.ts's withCachedReplyPreview) — this merge still
 * overwrites it with the authoritative joined data from the server either
 * way, since a plain object spread always takes the newer value.
 */
/**
 * Shared by upsertIncomingMessage and applyIncomingMessageUpdate: merges a
 * (possibly partial) update into whichever page currently holds this
 * message id. Returns the updated pages and whether it was found anywhere.
 */
function mergeMessageIntoPages(
  pages: MessagesQueryData["pages"],
  update: Partial<ChatMessageVM> & Pick<ChatMessageVM, "id">
): { pages: MessagesQueryData["pages"]; found: boolean } {
  let found = false;
  const nextPages = pages.map((page) => {
    if (!Array.isArray(page)) return page;
    return page.map((m) => {
      if (m?.id !== update.id) return m;
      found = true;
      return { ...m, ...update };
    });
  });
  return { pages: nextPages, found };
}

export function upsertIncomingMessage(
  queryClient: QueryClient,
  chatId: string,
  newMessage: ChatMessageVM
): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => {
      // If we somehow haven't got any cached pages yet, just prepend.
      if (!old) return prependMessage(old, newMessage);

      const safePages = Array.isArray(old.pages) ? old.pages : [[]];

      // Since real-time INSERTs are always newest, try page[0] first to
      // avoid scanning the whole infinite list.
      if (Array.isArray(safePages[0])) {
        const idx = safePages[0].findIndex((m) => m?.id === newMessage.id);
        if (idx !== -1) {
          const nextFirstPage = safePages[0].map((m) =>
            m?.id === newMessage.id ? { ...m, ...newMessage } : m
          );
          return { ...old, pages: [nextFirstPage, ...safePages.slice(1)] };
        }
      }

      // Fallback: scan all loaded pages (defensive for edge cases).
      const { pages, found } = mergeMessageIntoPages(safePages, newMessage);
      if (found) return { ...old, pages };

      return prependMessage(old, newMessage);
    }
  );
}

/**
 * Reflects a delete-for-everyone into any other cached message's reply
 * quote that references it, so a reply's embedded snapshot shows the
 * tombstone state without waiting for a refetch.
 */
function markReplyPreviewsDeleted(
  pages: MessagesQueryData["pages"],
  deletedMessageId: string
): MessagesQueryData["pages"] {
  return pages.map((page) =>
    page.map((msg) =>
      msg?.replyToMessage?.id === deletedMessageId
        ? {
          ...msg,
          replyToMessage: {
            ...msg.replyToMessage!,
            deleted_by_sender: true,
            deleted_by_receiver: true,
          },
        }
        : msg
    )
  );
}

/**
 * Patches an existing, already-cached message (e.g. deletion flags
 * changing). Unlike upsertIncomingMessage, this never falls back to
 * prepending a new row: an update payload can be partial (only the
 * changed fields) and the target message may be an OLD one the user
 * hasn't scrolled back to yet — either way, fabricating a message entry
 * from a partial payload would render a broken bubble. If the message
 * isn't currently loaded, this is a no-op; scrolling to it later fetches
 * the correct state directly.
 */
export function applyIncomingMessageUpdate(
  queryClient: QueryClient,
  chatId: string,
  update: Partial<ChatMessageVM> & Pick<ChatMessageVM, "id">
): void {
  queryClient.setQueryData<MessagesQueryData>(
    [MESSAGES_QUERY_KEY, chatId],
    (old) => {
      if (!old) return old;

      const safePages = Array.isArray(old.pages) ? old.pages : [[]];
      const { pages, found } = mergeMessageIntoPages(safePages, update);
      if (!found) return old;

      const finalPages =
        update.deleted_by_sender === true && update.deleted_by_receiver === true
          ? markReplyPreviewsDeleted(pages, update.id)
          : pages;

      return { ...old, pages: finalPages };
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
      const tombstonePages = old.pages.map((page) =>
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
      );
      return {
        ...old,
        pages: markReplyPreviewsDeleted(tombstonePages, messageId),
      };
    }
  );
}
