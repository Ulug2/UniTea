jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useBookmarkToggle } from '../../../features/posts/hooks/useBookmarkToggle';
import { supabase } from '../../../lib/supabase';

const mockFrom = supabase.from as jest.Mock;

/** Build a chainable Supabase query mock that resolves to `terminalResult`. */
function buildChain(terminalResult: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'not', 'in', 'or', 'order', 'range', 'limit', 'single', 'maybeSingle'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
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
let alertSpy: jest.SpyInstance;

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
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  queryClient.clear();
});

describe('useBookmarkToggle', () => {
  const postId = 'post-123';
  const viewerId = 'user-abc';

  // ── guards ───────────────────────────────────────────────────────────────────
  describe('guards', () => {
    it('throws "User or post ID missing" when viewerId is null', async () => {
      const { result } = renderHook(
        () => useBookmarkToggle({ postId, viewerId: null }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(true); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
      expect((result.current.error as Error).message).toBe('User or post ID missing');
    });

    it('throws "User or post ID missing" when postId is null', async () => {
      const { result } = renderHook(
        () => useBookmarkToggle({ postId: null, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(true); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('User or post ID missing');
    });
  });

  // ── add bookmark ─────────────────────────────────────────────────────────────
  describe('add bookmark (shouldBookmark = true)', () => {
    it('calls supabase.from("bookmarks").insert with correct payload', async () => {
      const chain = buildChain({ data: null, error: null });
      mockFrom.mockReturnValueOnce(chain);

      const { result } = renderHook(
        () => useBookmarkToggle({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(true); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFrom).toHaveBeenCalledWith('bookmarks');
      expect(chain.insert).toHaveBeenCalledWith({ user_id: viewerId, post_id: postId });
    });

    it('invalidates the correct query keys on success', async () => {
      const chain = buildChain({ data: null, error: null });
      mockFrom.mockReturnValueOnce(chain);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useBookmarkToggle({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(true); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryKeys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
      expect(queryKeys).toContainEqual(['bookmarks', postId]);
      expect(queryKeys).toContainEqual(['posts', 'feed']);
      expect(queryKeys.some((k: any) => k?.[0] === 'user-posts' && k?.[1] === viewerId)).toBe(true);
    });
  });

  // ── remove bookmark ──────────────────────────────────────────────────────────
  describe('remove bookmark (shouldBookmark = false)', () => {
    it('calls delete().eq().eq() with correct arguments', async () => {
      const chain = buildChain({ data: null, error: null });
      mockFrom.mockReturnValueOnce(chain);

      const { result } = renderHook(
        () => useBookmarkToggle({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(false); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', viewerId);
      expect(chain.eq).toHaveBeenCalledWith('post_id', postId);
    });
  });

  // ── error handling ───────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('shows Alert.alert on Supabase error', async () => {
      const dbError = new Error('Unique constraint violation');
      const chain = buildChain({ data: null, error: dbError });
      mockFrom.mockReturnValueOnce(chain);

      const { result } = renderHook(
        () => useBookmarkToggle({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(true); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(alertSpy).toHaveBeenCalledWith('Error', 'Unique constraint violation');
    });

    it('shows fallback Alert message for non-Error errors', async () => {
      // Make insert resolve badly: chain's then gives an error
      const chain = buildChain({ data: null, error: 'string-error' });
      mockFrom.mockReturnValueOnce(chain);

      const { result } = renderHook(
        () => useBookmarkToggle({ postId, viewerId }),
        { wrapper: createWrapper() }
      );

      act(() => { result.current.mutate(true); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Failed to update bookmark. Please try again.'
      );
    });
  });
});
