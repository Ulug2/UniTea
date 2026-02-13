import { useInfiniteQuery } from "@tanstack/react-query";
import {
  fetchChatMessagesPage,
  MESSAGES_PER_PAGE_DEFAULT,
} from "../data/queries";
import type { MessagesQueryData } from "../types";

const MESSAGES_QUERY_KEY = "chat-messages";

type Options = { pageSize?: number };

export function useChatMessagesInfinite(chatId: string, options: Options = {}) {
  const pageSize = options.pageSize ?? MESSAGES_PER_PAGE_DEFAULT;

  const query = useInfiniteQuery<
    MessagesQueryData["pages"][number],
    Error,
    MessagesQueryData
  >({
    queryKey: [MESSAGES_QUERY_KEY, chatId],
    queryFn: async ({ pageParam }) => {
      return fetchChatMessagesPage(chatId, pageParam as number, pageSize);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length === pageSize) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: Boolean(chatId),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 15,
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
