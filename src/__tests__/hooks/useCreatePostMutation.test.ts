jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
  },
}));
jest.mock('../../utils/supabaseImages', () => ({
  uploadImage: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useCreatePostMutation } from '../../hooks/useCreatePostMutation';
import { supabase } from '../../lib/supabase';

const mockGetSession = supabase.auth.getSession as jest.Mock;

const SUPABASE_URL = 'https://test.supabase.co';
const ANON_KEY = 'test-anon-key';
const ACCESS_TOKEN = 'mock-access-token';
const USER_ID = 'user-abc';

const defaultVars = {
  imagePath: undefined,
  postContent: 'Hello world',
  postLocation: '',
  postIsAnonymous: false,
  postCategory: 'lost' as const,
  pollOptions: undefined,
};

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function mockFetchSuccess(body: object = { id: 'post-1', content: 'Hello world' }) {
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

  mockGetSession.mockResolvedValue({
    data: { session: { access_token: ACCESS_TOKEN } },
    error: null,
  });
});

afterEach(() => {
  queryClient.clear();
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

describe('useCreatePostMutation', () => {
  // ── guards ───────────────────────────────────────────────────────────────────
  describe('guards', () => {
    it('throws "You must be logged in" when currentUserId is null', async () => {
      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: null }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultVars); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toContain('logged in');
    });

    it('throws "Content is required" for regular post with empty content', async () => {
      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate({ ...defaultVars, postContent: '   ' }); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('Content is required');
    });

    it('does NOT require content for a repost (resolvedRepostId passed)', async () => {
      mockFetchSuccess({ id: 'post-2', content: '' });

      const { result } = renderHook(
        () =>
          useCreatePostMutation({
            isLostFound: false,
            currentUserId: USER_ID,
            repostId: 'original-post-id',
          }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate({ ...defaultVars, postContent: '' }); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('throws "Location is required" for lost&found post with empty location', async () => {
      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: true, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ ...defaultVars, postContent: 'Lost item', postLocation: '' });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe(
        'Location is required for lost & found posts'
      );
    });

    it('throws "logged in" when getSession returns no session', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultVars); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toContain('logged in');
    });
  });

  // ── happy path — feed post ────────────────────────────────────────────────────
  describe('happy path — feed post', () => {
    it('calls fetch with the correct URL and Authorization header', async () => {
      mockFetchSuccess({ id: 'post-1' });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultVars); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/functions/v1/create-post`);
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('invalidates ["posts","feed"] on success', async () => {
      mockFetchSuccess({ id: 'post-1' });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultVars); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryKeys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
      expect(queryKeys).toContainEqual(['posts', 'feed']);
    });
  });

  // ── happy path — lost & found post ───────────────────────────────────────────
  describe('happy path — lost & found post', () => {
    it('invalidates ["posts","lost_found"] on success', async () => {
      mockFetchSuccess({ id: 'post-2' });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: true, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ ...defaultVars, postContent: 'Lost keys', postLocation: 'Gym' });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryKeys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
      expect(queryKeys).toContainEqual(['posts', 'lost_found']);
    });

    it('sets is_anonymous: false in payload for lost&found', async () => {
      mockFetchSuccess({ id: 'post-2' });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: true, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({
          ...defaultVars,
          postContent: 'Lost item',
          postLocation: 'Library',
          postIsAnonymous: true, // should be overridden to false for L&F
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(fetchBody.is_anonymous).toBe(false);
    });
  });

  // ── repostId resolution ───────────────────────────────────────────────────────
  describe('repostId resolution', () => {
    it('uses first element when repostId is an array', async () => {
      mockFetchSuccess({ id: 'post-3' });

      const { result } = renderHook(
        () =>
          useCreatePostMutation({
            isLostFound: false,
            currentUserId: USER_ID,
            repostId: ['first-id', 'second-id'],
          }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate({ ...defaultVars, postContent: 'My take' }); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(fetchBody.reposted_from_post_id).toBe('first-id');
    });
  });

  // ── optimistic update ─────────────────────────────────────────────────────────
  describe('optimistic update (feed posts)', () => {
    it('prepends a temp post to ["posts","feed","new"] on mutate', async () => {
      // Spy on setQueryData to capture optimistic updates before gcTime:0 GC removes them
      const capturedCalls: Array<{ key: unknown; value: unknown }> = [];
      const originalSetQueryData = queryClient.setQueryData.bind(queryClient);
      jest.spyOn(queryClient, 'setQueryData').mockImplementation(
        (key: any, value: any) => {
          capturedCalls.push({ key, value });
          return originalSetQueryData(key, value);
        }
      );

      mockFetchSuccess({ id: 'post-1' });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate({ ...defaultVars, postContent: 'Optimistic' }); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Find the optimistic setQueryData call for ['posts','feed','new']
      const optimisticCall = capturedCalls.find(
        (c) => JSON.stringify(c.key) === JSON.stringify(['posts', 'feed', 'new'])
      );
      expect(optimisticCall).toBeDefined();

      // The value is a function updater — call it with undefined to get initial pages
      const computedValue: any =
        typeof optimisticCall!.value === 'function'
          ? (optimisticCall!.value as Function)(undefined)
          : optimisticCall!.value;

      const firstPage = computedValue?.pages?.[0];
      expect(Array.isArray(firstPage)).toBe(true);
      const tempPost = firstPage?.[0];
      expect(tempPost?.post_id).toMatch(/^temp-/);
      expect(tempPost?.content).toBe('Optimistic');
    });

    it('does NOT add optimistic post for lost&found (isLostFound=true)', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({ ok: true, json: async () => ({ id: 'post-2' }) }),
              50
            )
          )
      );

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: true, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({
          ...defaultVars,
          postContent: 'Lost item',
          postLocation: 'Campus',
        });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const cache = queryClient.getQueryData(['posts', 'feed', 'new']);
      expect(cache).toBeUndefined();
    });
  });

  // ── rollback on error ─────────────────────────────────────────────────────────
  describe('rollback on error', () => {
    it('restores previous ["posts","feed","new"] data when mutation fails', async () => {
      const previousPosts = {
        pages: [[{ post_id: 'old-post', content: 'Old' }]],
        pageParams: [0],
      };
      queryClient.setQueryData(['posts', 'feed', 'new'], previousPosts);

      // Spy to capture ALL setQueryData calls (including the rollback from onError)
      const capturedCalls: Array<{ key: unknown; value: unknown }> = [];
      const originalSetQueryData = queryClient.setQueryData.bind(queryClient);
      jest.spyOn(queryClient, 'setQueryData').mockImplementation(
        (key: any, value: any) => {
          capturedCalls.push({ key, value });
          return originalSetQueryData(key, value);
        }
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate({ ...defaultVars, postContent: 'New post' }); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // onError calls setQueryData with the previousData captured during onMutate
      const feedNewCalls = capturedCalls.filter(
        (c) => JSON.stringify(c.key) === JSON.stringify(['posts', 'feed', 'new'])
      );
      // Last call should be the rollback value (previousPosts)
      const rollbackCall = feedNewCalls[feedNewCalls.length - 1];
      expect(rollbackCall).toBeDefined();
      // The rollback value is previousPosts (set directly, not via updater function)
      expect(rollbackCall!.value).toEqual(previousPosts);
    });
  });

  // ── error handling ────────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('shows Alert.alert with server error message on non-ok fetch', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Content policy violation' }),
      });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultVars); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Content policy violation');
    });

    it('shows "Invalid response from server" when response has no id', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok' }),
      });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultVars); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Invalid response from server');
    });
  });
});
