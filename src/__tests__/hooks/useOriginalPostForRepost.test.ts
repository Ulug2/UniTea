import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOriginalPostForRepost } from '../../hooks/useOriginalPostForRepost';

// ----- module mocks -------------------------------------------------------
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../lib/supabase';

const mockFrom = supabase.from as jest.Mock;

// ----- helpers ------------------------------------------------------------

type ChainResult = { data?: unknown; error?: unknown };

function buildQueryChain(result: ChainResult) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.or = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));
  mockFrom.mockReturnValue(chain);
  return chain;
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// --------------------------------------------------------------------------

describe('useOriginalPostForRepost', () => {
  let queryClient: QueryClient;

  // Ensure real timers are in effect regardless of what other test suites have
  // done — useTimeoutRace.test.ts uses jest.useFakeTimers() and its state can
  // leak into this suite when the two files share a worker process.  If fake
  // timers are active, React Query's internal notifyManager.setTimeout never
  // fires and waitFor() calls time out.
  beforeAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ── disabled when repostId is undefined ──────────────────────────────
  describe('when repostId is undefined', () => {
    it('does not call supabase and returns null / isLoading=false', () => {
      const { result } = renderHook(
        () => useOriginalPostForRepost(undefined),
        { wrapper: wrapper(queryClient) },
      );

      expect(mockFrom).not.toHaveBeenCalled();
      expect(result.current.originalPost).toBeNull();
      expect(result.current.isLoadingOriginal).toBe(false);
    });
  });

  // ── string repostId ───────────────────────────────────────────────────
  describe('when repostId is a string', () => {
    it('queries with the string value and returns originalPost', async () => {
      const fakePost = { post_id: 'post-123', content: 'hello' };
      const chain = buildQueryChain({ data: fakePost, error: null });

      const { result } = renderHook(
        () => useOriginalPostForRepost('post-123'),
        { wrapper: wrapper(queryClient) },
      );

      await waitFor(() => expect(result.current.originalPost).toEqual(fakePost), { timeout: 3000 });

      expect(mockFrom).toHaveBeenCalledWith('posts_summary_view');
      expect(chain.eq).toHaveBeenCalledWith('post_id', 'post-123');
    });

    it('includes the is_banned filter', async () => {
      const chain = buildQueryChain({ data: null, error: null });

      const { result } = renderHook(
        () => useOriginalPostForRepost('post-abc'),
        { wrapper: wrapper(queryClient) },
      );

      await waitFor(() => expect(result.current.isLoadingOriginal).toBe(false), { timeout: 3000 });

      expect(chain.or).toHaveBeenCalledWith('is_banned.is.null,is_banned.eq.false');
    });
  });

  // ── array repostId ────────────────────────────────────────────────────
  describe('when repostId is an array', () => {
    it('uses the first element of the array', async () => {
      const fakePost = { post_id: 'post-arr-0' };
      const chain = buildQueryChain({ data: fakePost, error: null });

      const { result } = renderHook(
        () => useOriginalPostForRepost(['post-arr-0', 'post-arr-1']),
        { wrapper: wrapper(queryClient) },
      );

      await waitFor(() => expect(result.current.originalPost).toEqual(fakePost), { timeout: 3000 });

      expect(chain.eq).toHaveBeenCalledWith('post_id', 'post-arr-0');
    });
  });

  // ── null data → null ──────────────────────────────────────────────────
  describe('when supabase returns null data', () => {
    it('originalPost is null', async () => {
      buildQueryChain({ data: null, error: null });

      const { result } = renderHook(
        () => useOriginalPostForRepost('post-null'),
        { wrapper: wrapper(queryClient) },
      );

      await waitFor(() => expect(result.current.isLoadingOriginal).toBe(false), { timeout: 3000 });

      expect(result.current.originalPost).toBeNull();
    });
  });

  // ── DB error ──────────────────────────────────────────────────────────
  describe('when supabase returns an error', () => {
    it('query.isError is true', async () => {
      buildQueryChain({ data: null, error: { message: 'not found' } });

      const { result } = renderHook(
        () => useOriginalPostForRepost('post-err'),
        { wrapper: wrapper(queryClient) },
      );

      await waitFor(() => expect(result.current.query.isError).toBe(true), { timeout: 3000 });

      expect(result.current.originalPost).toBeNull();
    });
  });
});
