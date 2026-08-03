/**
 * Tests for src/features/chat/hooks/useChatMessagesInfinite.ts
 */

jest.mock('../../../../features/chat/data/queries', () => ({
  fetchChatMessagesPage: jest.fn(),
  MESSAGES_PER_PAGE_DEFAULT: 20,
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useChatMessagesInfinite,
  prefetchChatMessages,
  CHAT_MESSAGES_QUERY_KEY,
} from '../../../../features/chat/hooks/useChatMessagesInfinite';
import { fetchChatMessagesPage, MESSAGES_PER_PAGE_DEFAULT } from '../../../../features/chat/data/queries';

const mockFetch = fetchChatMessagesPage as jest.Mock;

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    content: `Message ${i}`,
    chat_id: 'chat-1',
    user_id: 'user-1',
    created_at: new Date().toISOString(),
    is_read: false,
    deleted_by_receiver: null,
    deleted_by_sender: null,
  }));
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, retryDelay: 0 },
    },
  });
  jest.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

describe('useChatMessagesInfinite', () => {
  it('is disabled when chatId is empty string', () => {
    const { result } = renderHook(() => useChatMessagesInfinite(''), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches data on mount with a valid chatId', async () => {
    const messages = makeMessages(5);
    mockFetch.mockResolvedValue(messages);

    const { result } = renderHook(() => useChatMessagesInfinite('chat-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.pages[0]).toEqual(messages);
    expect(mockFetch).toHaveBeenCalledWith('chat-1', 0, MESSAGES_PER_PAGE_DEFAULT);
  });

  it('hasNextPage is true when last page has MESSAGES_PER_PAGE_DEFAULT messages', async () => {
    const messages = makeMessages(MESSAGES_PER_PAGE_DEFAULT);
    mockFetch.mockResolvedValue(messages);

    const { result } = renderHook(() => useChatMessagesInfinite('chat-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('hasNextPage is false when last page has fewer than MESSAGES_PER_PAGE_DEFAULT messages', async () => {
    const messages = makeMessages(5); // fewer than 20
    mockFetch.mockResolvedValue(messages);

    const { result } = renderHook(() => useChatMessagesInfinite('chat-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('isError is true on DB error', async () => {
    mockFetch.mockRejectedValue(new Error('db error'));

    const { result } = renderHook(() => useChatMessagesInfinite('chat-err'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.query.isError).toBe(true));
  });

  it('respects custom pageSize option', async () => {
    mockFetch.mockResolvedValue(makeMessages(10));

    const { result } = renderHook(
      () => useChatMessagesInfinite('chat-1', { pageSize: 10 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith('chat-1', 0, 10);
  });
});

describe('prefetchChatMessages', () => {
  it('populates the exact cache entry useChatMessagesInfinite reads', async () => {
    const messages = makeMessages(5);
    mockFetch.mockResolvedValue(messages);

    prefetchChatMessages(queryClient, 'chat-1');
    await waitFor(() =>
      expect(
        queryClient.getQueryData([CHAT_MESSAGES_QUERY_KEY, 'chat-1'])
      ).toBeDefined()
    );

    const cached = queryClient.getQueryData<{ pages: unknown[][] }>([
      CHAT_MESSAGES_QUERY_KEY,
      'chat-1',
    ]);
    expect(cached?.pages[0]).toEqual(messages);
    expect(mockFetch).toHaveBeenCalledWith('chat-1', 0, MESSAGES_PER_PAGE_DEFAULT);

    // The live hook, mounted afterward, must read the same primed entry
    // instead of firing a second network request.
    const { result } = renderHook(() => useChatMessagesInfinite('chat-1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.pages[0]).toEqual(messages);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for an empty chatId', () => {
    prefetchChatMessages(queryClient, '');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not refetch when the cache entry is already fresh', async () => {
    mockFetch.mockResolvedValue(makeMessages(3));

    prefetchChatMessages(queryClient, 'chat-1');
    await waitFor(() =>
      expect(
        queryClient.getQueryData([CHAT_MESSAGES_QUERY_KEY, 'chat-1'])
      ).toBeDefined()
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Tapping the same chat row again immediately (still within staleTime)
    // must not issue a second network request.
    prefetchChatMessages(queryClient, 'chat-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected fetch instead of throwing', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));

    expect(() => prefetchChatMessages(queryClient, 'chat-err')).not.toThrow();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });
});
