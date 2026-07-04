jest.mock('../../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { error: jest.fn() },
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useInitiateAnonymousChat } from '../../../../features/chat/hooks/useInitiateAnonymousChat';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../lib/supabase';

const mockUseAuth = useAuth as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

function buildChain(terminalResult: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['select', 'insert', 'eq', 'single', 'maybeSingle'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  // single()/maybeSingle() are the terminal calls in every path this hook takes.
  chain.single = jest.fn().mockResolvedValue(terminalResult);
  chain.maybeSingle = jest.fn().mockResolvedValue(terminalResult);
  return chain;
}

const CURRENT_USER = 'aaaaaaaa-0000-0000-0000-000000000001'; // sorts before AUTHOR
const AUTHOR = 'bbbbbbbb-0000-0000-0000-000000000002'; // sorts after CURRENT_USER

let queryClient: QueryClient;
let alertSpy: jest.SpyInstance;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockUseAuth.mockReturnValue({ session: { user: { id: CURRENT_USER } } });
});

afterEach(() => {
  queryClient.clear();
});

describe('useInitiateAnonymousChat', () => {
  describe('guards', () => {
    it('throws "Not authenticated" when there is no session', async () => {
      mockUseAuth.mockReturnValue({ session: null });
      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: AUTHOR, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('Not authenticated');
    });

    it('throws "Cannot start a chat with yourself" when postAuthorId equals the current user', async () => {
      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: CURRENT_USER, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('Cannot start a chat with yourself');
    });

    it('throws when postAuthorId is missing for a non-anonymous post', async () => {
      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: null, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe(
        'postAuthorId required for non-anonymous chats',
      );
    });
  });

  describe('non-anonymous: canonical participant ordering', () => {
    it('orders participants with the smaller UUID as participant_1 when current user sorts first', async () => {
      const chain = buildChain({ data: { id: 'chat-1' }, error: null });
      mockFrom.mockReturnValueOnce(chain); // select (dedup lookup)

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: AUTHOR, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(chain.eq).toHaveBeenCalledWith('participant_1_id', CURRENT_USER);
      expect(chain.eq).toHaveBeenCalledWith('participant_2_id', AUTHOR);
    });

    it('orders participants with the smaller UUID as participant_1 when the author sorts first', async () => {
      const chain = buildChain({ data: { id: 'chat-1' }, error: null });
      mockFrom.mockReturnValueOnce(chain);

      // Use a postAuthorId that sorts BEFORE the current user this time.
      const earlyAuthor = '00000000-0000-0000-0000-000000000000';
      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: earlyAuthor, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(chain.eq).toHaveBeenCalledWith('participant_1_id', earlyAuthor);
      expect(chain.eq).toHaveBeenCalledWith('participant_2_id', CURRENT_USER);
    });
  });

  describe('non-anonymous: dedup and creation', () => {
    it('returns the existing chat id without inserting when a chat already exists', async () => {
      const selectChain = buildChain({ data: { id: 'existing-chat' }, error: null });
      mockFrom.mockReturnValueOnce(selectChain);

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: AUTHOR, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({ chatId: 'existing-chat' });
      expect(selectChain.insert).not.toHaveBeenCalled();
    });

    it('inserts a new chat and returns its id when none exists', async () => {
      const selectChain = buildChain({ data: null, error: null });
      const insertChain = buildChain({ data: { id: 'new-chat' }, error: null });
      mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(insertChain);

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: AUTHOR, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({ chatId: 'new-chat' });
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          participant_1_id: CURRENT_USER,
          participant_2_id: AUTHOR,
          post_id: 'p1',
          initiator_id: CURRENT_USER,
          is_anonymous: false,
        }),
      );
    });

    it('recovers from a 23505 unique-violation race by re-selecting the row another request just created', async () => {
      const selectChain = buildChain({ data: null, error: null });
      const insertChain = buildChain({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });
      const recoverySelectChain = buildChain({ data: { id: 'raced-chat' }, error: null });
      mockFrom
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(recoverySelectChain);

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: AUTHOR, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ chatId: 'raced-chat' });
    });

    it('throws for insert errors that are not a unique-violation', async () => {
      const selectChain = buildChain({ data: null, error: null });
      const insertChain = buildChain({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      });
      mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(insertChain);

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: AUTHOR, isPostAnonymous: false });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('permission denied');
    });
  });

  describe('anonymous posts: RPC path', () => {
    it('calls initiate_anonymous_chat RPC with the post id and returns the chat id', async () => {
      mockRpc.mockResolvedValue({ data: 'anon-chat-id', error: null });

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: null, isPostAnonymous: true });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockRpc).toHaveBeenCalledWith('initiate_anonymous_chat', { p_post_id: 'p1' });
      expect(result.current.data).toEqual({ chatId: 'anon-chat-id' });
      // The RPC path never touches .from("chats") directly — it's all server-side.
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('throws when the RPC returns an error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: null, isPostAnonymous: true });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('rpc failed');
    });

    it('does not require postAuthorId for anonymous posts (author is resolved server-side)', async () => {
      mockRpc.mockResolvedValue({ data: 'anon-chat-id', error: null });

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: undefined, isPostAnonymous: true });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('onSuccess / onError side effects', () => {
    it('invalidates the chat-summaries query for the current user without forcing a refetch', async () => {
      mockRpc.mockResolvedValue({ data: 'anon-chat-id', error: null });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: null, isPostAnonymous: true });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['chat-summaries', CURRENT_USER],
        refetchType: 'none',
      });
    });

    it('shows a rate-limit Alert only when the error message indicates a rate limit', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: new Error('rate_limit_exceeded: slow down'),
      });

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: null, isPostAnonymous: true });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(alertSpy).toHaveBeenCalledWith(
        'Slow down',
        "You're starting too many chats. Please wait a moment before trying again.",
      );
    });

    it('does not show any Alert for a non-rate-limit error (only logs it)', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('some other failure') });

      const { result } = renderHook(() => useInitiateAnonymousChat(), { wrapper: createWrapper() });

      act(() => {
        result.current.mutate({ postId: 'p1', postAuthorId: null, isPostAnonymous: true });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });
});
