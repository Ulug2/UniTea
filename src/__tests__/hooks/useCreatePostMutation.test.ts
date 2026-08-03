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
import { feedKeys } from '../../features/communities/data/queryKeys';
import { supabase } from '../../lib/supabase';

const DEFAULT_FEED_CACHE_KEY = feedKeys.list('new', '', undefined, null);

const mockGetSession = supabase.auth.getSession as jest.Mock;

const SUPABASE_URL = 'https://test.supabase.co';
const ANON_KEY = 'test-anon-key';
const ACCESS_TOKEN = 'mock-access-token';
const USER_ID = 'user-abc';

const defaultVars = {
  id: 'client-generated-id-1',
  imagePath: undefined,
  imagePaths: [],
  postContent: 'Hello world',
  postTitle: '',
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

    it('invalidates only the affected community\'s (here, Campus\'s) feed caches on success — not every mounted feed', async () => {
      mockFetchSuccess({ id: 'post-1' });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(defaultVars); }); // no communityId → Campus Feed

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const predicateCall = invalidateSpy.mock.calls.find(
        (c) => typeof (c[0] as any)?.predicate === 'function',
      );
      expect(predicateCall).toBeDefined();
      const predicate = (predicateCall![0] as any).predicate;

      // Matches Campus Feed's own cache entries, regardless of filter/search text...
      expect(predicate({ queryKey: ['posts', 'feed', 'new', '', 'uni-1', null] })).toBe(true);
      expect(predicate({ queryKey: ['posts', 'feed', 'hot', 'search', 'uni-1', null] })).toBe(true);
      // ...but never a different community's cache — this is the regression
      // guard for posts leaking into/invalidating another feed's cache.
      expect(predicate({ queryKey: ['posts', 'feed', 'new', '', 'uni-1', 'other-community'] })).toBe(
        false,
      );
    });

    it('sends image_urls and keeps first item as image_url', async () => {
      mockFetchSuccess({ id: 'post-4' });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({
          ...defaultVars,
          postContent: '',
          imagePaths: ['posts/a.webp', 'posts/b.webp'],
          imagePath: 'posts/a.webp',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(fetchBody.image_urls).toEqual(['posts/a.webp', 'posts/b.webp']);
      expect(fetchBody.image_url).toBe('posts/a.webp');
    });

    it('sends the caller-provided idempotency id in the request body', async () => {
      mockFetchSuccess({ id: 'post-9' });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ ...defaultVars, id: 'stable-retry-id-99' });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(fetchBody.id).toBe('stable-retry-id-99');
    });

    it('includes title for feed posts when provided', async () => {
      mockFetchSuccess({ id: 'post-5' });

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({
          ...defaultVars,
          postTitle: '  Lost wallet update  ',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(fetchBody.title).toBe('Lost wallet update');
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

    it('mutateAsync() does not resolve until the lost&found list has actually finished refetching, not merely until the refetch was requested (Phase 7.6)', async () => {
      mockFetchSuccess({ id: 'post-10' });

      let resolveInvalidate!: () => void;
      const invalidatePromise = new Promise<void>((r) => { resolveInvalidate = r; });
      const invalidateSpy = jest
        .spyOn(queryClient, 'invalidateQueries')
        .mockImplementation(() => invalidatePromise as any);

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: true, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      let mutateAsyncResolved = false;
      const mutatePromise = result.current
        .mutateAsync({ ...defaultVars, postContent: 'Lost keys', postLocation: 'Gym' })
        .then(() => { mutateAsyncResolved = true; });

      // The fetch has resolved and invalidateQueries has been called, but its
      // own promise is still pending — mutateAsync must not have resolved yet.
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(mutateAsyncResolved).toBe(false);

      // Only once the refetch itself completes does mutateAsync resolve —
      // this is exactly what lets create-post.tsx safely navigate away only
      // once the post is genuinely visible in the Lost & Found feed.
      resolveInvalidate();
      await mutatePromise;
      expect(mutateAsyncResolved).toBe(true);
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

  // ── feed cache insertion (Phase 7.6: no optimistic pre-insert) ─────────────────
  // The user stays on the create-post screen until the post is genuinely
  // confirmed AND reflected in the feed, so nothing is ever written to the
  // feed cache before the server has responded — see useCreatePostMutation.ts's
  // onSuccess. Every test here spies on setQueryData and replays the captured
  // calls itself (the same technique the pre-existing tests in this file
  // used), rather than reading back queryClient.getQueryData() afterward —
  // this queryClient's gcTime:0 garbage-collects unobserved cache entries on
  // the next tick, so a post-hoc read is a real race, not just a style choice.
  describe('feed cache insertion on success (no optimistic pre-insert)', () => {
    function spyOnSetQueryData() {
      const capturedCalls: Array<{ key: unknown; value: unknown }> = [];
      const originalSetQueryData = queryClient.setQueryData.bind(queryClient);
      jest.spyOn(queryClient, 'setQueryData').mockImplementation(
        (key: any, value: any) => {
          capturedCalls.push({ key, value });
          return originalSetQueryData(key, value);
        }
      );
      return capturedCalls;
    }

    function feedCallsFor(capturedCalls: Array<{ key: unknown; value: unknown }>) {
      return capturedCalls.filter(
        (c) => JSON.stringify(c.key) === JSON.stringify(DEFAULT_FEED_CACHE_KEY)
      );
    }

    it('never calls setQueryData for the feed key while the mutation is still pending', async () => {
      let resolveFetch!: (v: any) => void;
      const pending = new Promise((r) => { resolveFetch = r; });
      (global.fetch as jest.Mock).mockImplementationOnce(() => pending);
      const capturedCalls = spyOnSetQueryData();

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate({ ...defaultVars, postContent: 'Not yet' }); });
      await act(async () => { await Promise.resolve(); });

      expect(feedCallsFor(capturedCalls)).toHaveLength(0);

      await act(async () => {
        resolveFetch({ ok: true, json: async () => ({ id: 'post-1' }) });
        await pending;
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Only after success does the write happen, and exactly once.
      expect(feedCallsFor(capturedCalls)).toHaveLength(1);
    });

    it('inserts the confirmed post (real server id, not a temp id) into ["posts","feed","new"] only after success', async () => {
      mockFetchSuccess({ id: 'post-1' });
      const capturedCalls = spyOnSetQueryData();

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate({ ...defaultVars, postContent: 'Confirmed' }); });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const feedCalls = feedCallsFor(capturedCalls);
      expect(feedCalls).toHaveLength(1);
      const computedValue: any =
        typeof feedCalls[0].value === 'function'
          ? (feedCalls[0].value as Function)(undefined)
          : feedCalls[0].value;

      const firstPage = computedValue?.pages?.[0];
      expect(Array.isArray(firstPage)).toBe(true);
      const post = firstPage?.[0];
      expect(post?.post_id).toBe('post-1');
      expect(post?.post_id).not.toMatch(/^temp-/);
      expect(post?.content).toBe('Confirmed');
      expect(post?.title).toBeNull();
    });

    it('stores title on the confirmed post when feed title is provided', async () => {
      mockFetchSuccess({ id: 'post-6' });
      const capturedCalls = spyOnSetQueryData();

      const { result } = renderHook(
        () => useCreatePostMutation({ isLostFound: false, currentUserId: USER_ID }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({
          ...defaultVars,
          postContent: 'Body text',
          postTitle: 'Feed heading',
        });
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const feedCalls = feedCallsFor(capturedCalls);
      const computedValue: any =
        typeof feedCalls[0].value === 'function'
          ? (feedCalls[0].value as Function)(undefined)
          : feedCalls[0].value;
      expect(computedValue?.pages?.[0]?.[0]?.title).toBe('Feed heading');
    });

    it('server-authoritative fields from the response win, while client-resolved display fields the response does not carry are preserved', async () => {
      mockFetchSuccess({
        id: 'real-post-id-42',
        content: 'Final content',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      const capturedCalls = spyOnSetQueryData();

      const { result } = renderHook(
        () =>
          useCreatePostMutation({
            isLostFound: false,
            currentUserId: USER_ID,
            communityName: 'Chess Club',
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ ...defaultVars, postContent: 'Draft content' });
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const feedCalls = feedCallsFor(capturedCalls);
      expect(feedCalls).toHaveLength(1);
      const computedValue: any =
        typeof feedCalls[0].value === 'function'
          ? (feedCalls[0].value as Function)(undefined)
          : feedCalls[0].value;
      const posts = computedValue?.pages?.flat() ?? [];
      // Exactly one post — inserted once, never a temp entry alongside it.
      expect(posts).toHaveLength(1);
      const finalPost = posts[0];

      expect(finalPost.post_id).toBe('real-post-id-42');
      // Server-authoritative fields win...
      expect(finalPost.content).toBe('Final content');
      expect(finalPost.created_at).toBe('2026-01-01T00:00:00.000Z');
      // ...but client-resolved display fields the server response doesn't
      // carry are filled in, not left missing.
      expect(finalPost.community_name).toBe('Chess Club');
      expect(finalPost.vote_score).toBe(0);
      expect(finalPost.comment_count).toBe(0);
    });

    it('uses the real username/avatarUrl passed via options for a non-anonymous post', async () => {
      mockFetchSuccess({ id: 'post-7' });
      const capturedCalls = spyOnSetQueryData();

      const { result } = renderHook(
        () =>
          useCreatePostMutation({
            isLostFound: false,
            currentUserId: USER_ID,
            username: 'realuser',
            avatarUrl: 'https://cdn.example.com/avatar.png',
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ ...defaultVars, postIsAnonymous: false });
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const feedCalls = feedCallsFor(capturedCalls);
      const computedValue: any =
        typeof feedCalls[0].value === 'function'
          ? (feedCalls[0].value as Function)(undefined)
          : feedCalls[0].value;
      const post = computedValue?.pages?.[0]?.[0];
      expect(post?.username).toBe('realuser');
      expect(post?.avatar_url).toBe('https://cdn.example.com/avatar.png');
    });

    it('still shows "You" for an anonymous post regardless of the real username/avatarUrl passed', async () => {
      mockFetchSuccess({ id: 'post-8' });
      const capturedCalls = spyOnSetQueryData();

      const { result } = renderHook(
        () =>
          useCreatePostMutation({
            isLostFound: false,
            currentUserId: USER_ID,
            username: 'realuser',
            avatarUrl: 'https://cdn.example.com/avatar.png',
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.mutate({ ...defaultVars, postIsAnonymous: true });
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const feedCalls = feedCallsFor(capturedCalls);
      const computedValue: any =
        typeof feedCalls[0].value === 'function'
          ? (feedCalls[0].value as Function)(undefined)
          : feedCalls[0].value;
      expect(computedValue?.pages?.[0]?.[0]?.username).toBe('You');
    });

    it('never calls setQueryData for the feed key for lost&found (isLostFound=true), before or after success', async () => {
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
      const capturedCalls = spyOnSetQueryData();

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
      expect(feedCallsFor(capturedCalls)).toHaveLength(0);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // Still untouched after success too — lost&found never uses this key.
      expect(feedCallsFor(capturedCalls)).toHaveLength(0);
    });
  });

  // ── no cache mutation on error ──────────────────────────────────────────────────
  describe('no cache mutation on error (nothing to roll back)', () => {
    it('never calls setQueryData for the feed key when the mutation fails', async () => {
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

      // No setQueryData call for the feed key at all — there was never an
      // optimistic write to roll back, and a failure writes nothing either.
      const feedNewCalls = capturedCalls.filter(
        (c) => JSON.stringify(c.key) === JSON.stringify(DEFAULT_FEED_CACHE_KEY)
      );
      expect(feedNewCalls).toHaveLength(0);
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
