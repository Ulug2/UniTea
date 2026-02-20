jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
  },
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useDeleteComment } from '../../../features/comments/hooks/useDeleteComment';
import { supabase } from '../../../lib/supabase';

const mockGetSession = supabase.auth.getSession as jest.Mock;

const SUPABASE_URL = 'https://test.supabase.co';
const ANON_KEY = 'test-anon-key';
const ACCESS_TOKEN = 'mock-access-token';

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
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

describe('useDeleteComment', () => {
  const commentId = 'comment-abc';
  const postId = 'post-123';
  const currentUserId = 'user-xyz';

  // ── guards ───────────────────────────────────────────────────────────────────
  describe('guards', () => {
    it('throws "You must be logged in to delete comments" when session has no access_token', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toContain('logged in to delete');
    });
  });

  // ── happy path ───────────────────────────────────────────────────────────────
  describe('happy path', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
    });

    it('calls fetch with correct URL, method and comment_id in body', async () => {
      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/functions/v1/delete-comment`);
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ comment_id: commentId });
    });

    it('sends Authorization header with session token', async () => {
      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const opts = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(opts.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('invalidates all expected query keys on success', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryKeys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
      expect(queryKeys).toContainEqual(['comments']);
      expect(queryKeys).toContainEqual(['post', postId]);
      expect(queryKeys).toContainEqual(['posts']);
      expect(queryKeys).toContainEqual(['user-posts']);
      expect(queryKeys).toContainEqual(['user-post-comments']);
      expect(queryKeys).toContainEqual(['bookmarked-posts']);
    });

    it('calls the onSuccess callback option', async () => {
      const onSuccessMock = jest.fn();

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId, onSuccess: onSuccessMock }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(onSuccessMock).toHaveBeenCalledTimes(1);
    });

    it('refetches ["comments", postId, currentUserId] when both are provided', async () => {
      const refetchSpy = jest.spyOn(queryClient, 'refetchQueries');

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const refetchKeys = refetchSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
      expect(refetchKeys).toContainEqual(['comments', postId, currentUserId]);
    });
  });

  // ── error handling ────────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('shows Alert.alert with server error message on non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Comment not found' }),
      });

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Comment not found');

    });

    it('shows fallback Alert message when response body has no error field', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to delete comment');
    });

    it('calls the onError callback option on failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const onErrorMock = jest.fn();

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId, onError: onErrorMock }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(onErrorMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT call the onSuccess callback on failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const onSuccessMock = jest.fn();

      const { result } = renderHook(
        () => useDeleteComment(commentId, { postId, currentUserId, onSuccess: onSuccessMock }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(onSuccessMock).not.toHaveBeenCalled();
    });
  });

  // ── without postId/currentUserId options ─────────────────────────────────────
  describe('without optional postId / currentUserId', () => {
    it('still calls fetch and invalidates queries successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useDeleteComment(commentId),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryKeys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
      expect(queryKeys).toContainEqual(['comments']);
    });
  });
});
