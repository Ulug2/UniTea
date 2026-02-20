jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      refreshSession: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useCreateComment } from '../../../features/comments/hooks/useCreateComment';
import { supabase } from '../../../lib/supabase';

const mockFrom = supabase.from as jest.Mock;
const mockRefreshSession = supabase.auth.refreshSession as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;

function buildChain(terminalResult: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'not', 'in', 'or', 'order', 'range', 'limit', 'maybeSingle'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(terminalResult);
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve(terminalResult);
      return p.then.bind(p);
    },
    configurable: true,
  });
  return chain;
}

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const SUPABASE_URL = 'https://test.supabase.co';
const ANON_KEY = 'test-anon-key';
const ACCESS_TOKEN = 'mock-access-token';

const mockSession = {
  access_token: ACCESS_TOKEN,
  user: { id: 'user-abc' },
};

function mockFetchSuccess(body: object = { id: 'comment-1', content: 'Hello' }) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  jest.clearAllMocks();

  process.env.EXPO_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;

  global.fetch = jest.fn();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  // Default: successful session refresh
  mockRefreshSession.mockResolvedValue({
    data: { session: mockSession },
    error: null,
  });
  mockGetSession.mockResolvedValue({
    data: { session: mockSession },
    error: null,
  });
});

afterEach(() => {
  queryClient.clear();
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

describe('useCreateComment', () => {
  const postId = 'post-123';
  const viewerId = 'user-abc';

  const defaultInput = { content: 'Great post!', parentId: null, isAnonymous: false };

  // ── guards ───────────────────────────────────────────────────────────────────
  describe('guards', () => {
    it('throws when viewerId is null', async () => {
      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId: null }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toContain('logged in');
    });

    it('throws when postId is null', async () => {
      const { result } = renderHook(
        () => useCreateComment({ postId: null, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('Post ID is required');
    });

    it('throws "Session expired" when refreshSession returns an error', async () => {
      mockRefreshSession.mockResolvedValueOnce({
        data: { session: null },
        error: new Error('token expired'),
      });

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toContain('Session expired');
    });

    it('throws "logged in" when no access_token after refresh', async () => {
      mockRefreshSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toContain('logged in');
    });
  });

  // ── parentId filtering ────────────────────────────────────────────────────────
  describe('parentId filtering', () => {
    it('strips temp- parentId from the payload (sets it to null)', async () => {
      mockFetchSuccess({ id: 'c1', content: 'Reply' });

      // Profile fetch for onSuccess
      const profileChain = buildChain({ data: { id: viewerId, username: 'testuser' }, error: null });
      mockFrom.mockReturnValueOnce(profileChain);

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ content: 'Reply', parentId: 'temp-1234', isAnonymous: false });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const fetchBody = JSON.parse(fetchCall[1].body);
      expect(fetchBody.parent_comment_id).toBeNull();
    });

    it('passes real parentId through in the payload', async () => {
      const realParentId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      mockFetchSuccess({ id: 'c2', content: 'Reply' });

      const profileChain = buildChain({ data: { id: viewerId }, error: null });
      mockFrom.mockReturnValueOnce(profileChain);

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ content: 'Reply', parentId: realParentId, isAnonymous: false });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(fetchBody.parent_comment_id).toBe(realParentId);
    });
  });

  // ── happy path ───────────────────────────────────────────────────────────────
  describe('happy path', () => {
    it('calls fetch with correct URL and authorization header', async () => {
      mockFetchSuccess({ id: 'c1', content: 'Hello' });
      const profileChain = buildChain({ data: { id: viewerId }, error: null });
      mockFrom.mockReturnValueOnce(profileChain);

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/functions/v1/create-comment`);
      expect(opts.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('fetches the viewer profile in onSuccess', async () => {
      mockFetchSuccess({ id: 'c1', content: 'Hello' });
      const profileChain = buildChain({ data: { id: viewerId, username: 'alice' }, error: null });
      mockFrom.mockReturnValueOnce(profileChain);

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFrom).toHaveBeenCalledWith('profiles');
    });

    it('appends the new comment to queryData for ["comments", postId, viewerId]', async () => {
      mockFetchSuccess({ id: 'c1', content: 'Hello' });
      const profileChain = buildChain({ data: { id: viewerId }, error: null });
      mockFrom.mockReturnValueOnce(profileChain);

      queryClient.setQueryData(['comments', postId, viewerId], []);

      const setDataSpy = jest.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(setDataSpy).toHaveBeenCalled();
      const setCall = setDataSpy.mock.calls.find(
        (c) => JSON.stringify(c[0]) === JSON.stringify(['comments', postId, viewerId])
      );
      expect(setCall).toBeDefined();
    });
  });

  // ── error handling ────────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('remaps "Unauthorized" to session-expired message', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Unauthorized' }),
      });

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toContain('Session expired or invalid');
    });

    it('shows rate-limit Alert message', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'rate limit exceeded' }),
      });

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.stringContaining("posting too fast")
      );
    });

    it('shows network-error Alert message', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'network timeout occurred' }),
      });

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.stringContaining('Network error')
      );
    });

    it('shows server error message from non-ok response body', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Content too long' }),
      });

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Content too long');
    });

    it('throws "Invalid response from server" when response has no id', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok but missing id' }),
      });

      const { result } = renderHook(
        () => useCreateComment({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultInput); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('Invalid response from server');
    });
  });
});
