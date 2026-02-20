import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeletePost } from '../../../features/posts/hooks/useDeletePost';

// ----- module mocks -------------------------------------------------------
jest.mock('../../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

import { supabase } from '../../../lib/supabase';
import { router } from 'expo-router';

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockRouterBack = (router as unknown as { back: jest.Mock }).back;

// ----- helpers ------------------------------------------------------------

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeOkFetch(body: object = { success: true }) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  });
}

function makeErrorFetch(body: object = { error: 'Delete failed' }) {
  return jest.fn().mockResolvedValue({
    ok: false,
    json: jest.fn().mockResolvedValue(body),
  });
}

// --------------------------------------------------------------------------

describe('useDeletePost', () => {
  let alertSpy: jest.SpyInstance;
  let queryClient: QueryClient;
  const SESSION = { access_token: 'tok-abc' };

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    queryClient.clear();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  });

  // ── no postId guard ───────────────────────────────────────────────────
  describe('when no postId and no overridePostId', () => {
    it('throws "Post ID is required"', async () => {
      global.fetch = makeOkFetch();
      const { result } = renderHook(() => useDeletePost(null), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await expect(result.current.mutateAsync(undefined)).rejects.toThrow('Post ID is required');
      });
    });
  });

  // ── no session guard ──────────────────────────────────────────────────
  describe('when session is missing', () => {
    it('throws "You must be logged in to delete posts"', async () => {
      global.fetch = makeOkFetch();
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const { result } = renderHook(() => useDeletePost('post-1'), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await expect(result.current.mutateAsync(undefined)).rejects.toThrow(
          'You must be logged in to delete posts',
        );
      });
    });
  });

  // ── happy path: closure postId ────────────────────────────────────────
  describe('when mutated with closure postId (no overridePostId)', () => {
    it('calls fetch with the closure post ID', async () => {
      global.fetch = makeOkFetch();

      const { result } = renderHook(() => useDeletePost('post-close'), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync(undefined); })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/delete-post',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ post_id: 'post-close' }),
        }),
      );
    });

    it('calls router.back() when postId is set and no overridePostId', async () => {
      global.fetch = makeOkFetch();

      const { result } = renderHook(() => useDeletePost('post-close'), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync(undefined); });

      expect(mockRouterBack).toHaveBeenCalledTimes(1);
    });

    it('calls the options.onSuccess callback', async () => {
      global.fetch = makeOkFetch();
      const onSuccess = jest.fn();

      const { result } = renderHook(() => useDeletePost('post-cb', { onSuccess }), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync(undefined); });

      expect(onSuccess).toHaveBeenCalled();
    });
  });

  // ── happy path: overridePostId ────────────────────────────────────────
  describe('when mutated with overridePostId', () => {
    it('uses the overridePostId in the request body', async () => {
      global.fetch = makeOkFetch();

      const { result } = renderHook(() => useDeletePost('post-close'), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync('post-override'); });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ post_id: 'post-override' }),
        }),
      );
    });

    it('does NOT call router.back() when overridePostId is provided', async () => {
      global.fetch = makeOkFetch();

      const { result } = renderHook(() => useDeletePost('post-close'), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync('post-override'); });

      expect(mockRouterBack).not.toHaveBeenCalled();
    });
  });

  // ── fetch auth headers ────────────────────────────────────────────────
  it('sends Authorization and apikey headers', async () => {
    global.fetch = makeOkFetch();

    const { result } = renderHook(() => useDeletePost('post-auth'), {
      wrapper: wrapper(queryClient),
    });

    await act(async () => { await result.current.mutateAsync(undefined); });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tok-abc',
          apikey: 'test-anon-key',
        }),
      }),
    );
  });

  // ── onSuccess invalidations ───────────────────────────────────────────
  describe('cache invalidations on success', () => {
    it('invalidates all 6 expected query keys', async () => {
      global.fetch = makeOkFetch();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeletePost('post-inv'), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync(undefined); });

      const keys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown[] }).queryKey[0],
      );
      expect(keys).toContain('posts');
      expect(keys).toContain('post');
      expect(keys).toContain('user-posts');
      expect(keys).toContain('user-post-comments');
      expect(keys).toContain('user-post-votes');
      expect(keys).toContain('bookmarked-posts');
    });
  });

  // ── fetch error handling ──────────────────────────────────────────────
  describe('when fetch returns a non-ok response', () => {
    it('shows an error alert with the server error message', async () => {
      global.fetch = makeErrorFetch({ error: 'Not allowed' });

      const { result } = renderHook(() => useDeletePost('post-fail'), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync(undefined).catch(() => {}); });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Error', 'Not allowed');
      });
    });

    it('falls back to generic message when no error field in body', async () => {
      global.fetch = makeErrorFetch({});

      const { result } = renderHook(() => useDeletePost('post-fail2'), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => { await result.current.mutateAsync(undefined).catch(() => {}); });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to delete post');
      });
    });
  });
});
