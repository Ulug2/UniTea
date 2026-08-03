import { useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import {
  fetchChatMessagesPage,
  MESSAGES_PER_PAGE_DEFAULT,
} from "../data/queries";
import type { MessagesQueryData } from "../types";

export const CHAT_MESSAGES_QUERY_KEY = "chat-messages";

const MESSAGES_STALE_TIME = 1000 * 60 * 2;
const MESSAGES_GC_TIME = 1000 * 60 * 15;

type Options = { pageSize?: number };

/**
 * Shared query definition for a chat's message pages — the single source
 * both useChatMessagesInfinite (the live hook) and prefetchChatMessages
 * (chat.tsx's tap-to-open priming) build on, so they can never drift into
 * two different cache shapes/staleTimes under the same query key.
 */
function messagesQueryOptions(chatId: string, pageSize: number) {
  return {
    queryKey: [CHAT_MESSAGES_QUERY_KEY, chatId],
    queryFn: async ({ pageParam }: { pageParam: unknown }) =>
      fetchChatMessagesPage(chatId, pageParam as number, pageSize),
    initialPageParam: 0,
    staleTime: MESSAGES_STALE_TIME,
    gcTime: MESSAGES_GC_TIME,
  };
}

export function useChatMessagesInfinite(chatId: string, options: Options = {}) {
  const pageSize = options.pageSize ?? MESSAGES_PER_PAGE_DEFAULT;

  const query = useInfiniteQuery<
    MessagesQueryData["pages"][number],
    Error,
    MessagesQueryData
  >({
    ...messagesQueryOptions(chatId, pageSize),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length === pageSize) {
        return allPages.length;
      }
      return undefined;
    },
    enabled: Boolean(chatId),
    retry: (failureCount) => failureCount < 2,
  });

  return {
    data: query.data,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    query,
  };
}

/**
 * Prefetches a chat's first message page into the exact same cache entry
 * useChatMessagesInfinite reads (["chat-messages", chatId]) — called from
 * chat.tsx's onBeforeNavigate, fire-and-forget, right as the user taps a
 * chat row. This is a head start, not a new loading path: it lets the
 * network request begin a beat before the detail screen mounts and runs
 * its own useChatMessagesInfinite, instead of only starting once that
 * screen exists. Reuses messagesQueryOptions above, so it respects the
 * same staleTime as the hook and is a no-op when the cache entry is
 * already fresh (e.g. this chat was recently viewed) — it never issues a
 * redundant fetch on top of one already in flight or satisfied.
 */
export function prefetchChatMessages(
  queryClient: QueryClient,
  chatId: string,
  pageSize: number = MESSAGES_PER_PAGE_DEFAULT,
): void {
  if (!chatId) return;
  queryClient
    .prefetchInfiniteQuery(messagesQueryOptions(chatId, pageSize))
    .catch(() => {
      // Best-effort priming only — the detail screen's own
      // useChatMessagesInfinite still runs and surfaces any real error.
    });
}
