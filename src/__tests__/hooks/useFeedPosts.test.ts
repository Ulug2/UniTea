jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFeedPosts, POSTS_PER_PAGE } from '../../hooks/useFeedPosts';
import { supabase } from '../../lib/supabase';

const mockFrom = supabase.from as jest.Mock;

function makePost(id: string) {
  return { post_id: id, post_type: 'feed', is_banned: false };
}

/** Builds a chainable query-builder mock; every listed method records its
 * call and returns the same chain, and `await chain` resolves like the real
 * supabase-js PostgrestBuilder (it's thenable, not a plain object). */
function buildChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, any> = {};
  ['select', 'eq', 'not', 'is', 'or', 'gte', 'order', 'range'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve(result);
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

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  jest.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

describe('useFeedPosts', () => {
  describe('enabled gating (regression: undefined universityId race)', () => {
    it('does not query at all when enabled is false', async () => {
      const chain = buildChain({ data: [makePost('1')], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: undefined,
            communityId: null,
            enabled: false,
          }),
        { wrapper: createWrapper() },
      );

      // Give any accidental async work a chance to run.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockFrom).not.toHaveBeenCalled();
      expect(result.current.isPending).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('queries once enabled becomes true', async () => {
      const chain = buildChain({ data: [makePost('1')], error: null });
      mockFrom.mockReturnValue(chain);

      const { result, rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: undefined,
            communityId: null,
            enabled,
          }),
        { wrapper: createWrapper(), initialProps: { enabled: false } },
      );

      expect(mockFrom).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(mockFrom).toHaveBeenCalledWith('posts_summary_view');
    });
  });

  describe('university + community scoping', () => {
    it('applies the university filter when universityId is provided', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.eq).toHaveBeenCalledWith('university_id', 'uni-1');
    });

    it('does not filter by university when universityId is undefined', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: undefined,
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.eq).not.toHaveBeenCalledWith('university_id', expect.anything());
    });

    it('scopes to the Campus Feed (community_id IS NULL) when communityId is null', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.is).toHaveBeenCalledWith('community_id', null);
      expect(chain.eq).not.toHaveBeenCalledWith('community_id', expect.anything());
    });

    it('scopes to a specific community when communityId is set', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: 'community-1',
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
      expect(chain.is).not.toHaveBeenCalled();
    });
  });

  describe('per-filter query construction', () => {
    it('"new" orders by created_at descending with no recency window', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'new',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.gte).not.toHaveBeenCalled();
    });

    it('"top" restricts to the last 7 days and orders by vote_score descending', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'top',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.gte).toHaveBeenCalledWith('created_at', expect.any(String));
      expect(chain.order).toHaveBeenCalledWith('vote_score', { ascending: false });
    });

    it('"hot" restricts to the last 7 days and orders by hot_score descending', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.gte).toHaveBeenCalledWith('created_at', expect.any(String));
      expect(chain.order).toHaveBeenCalledWith('hot_score', { ascending: false });
    });
  });

  describe('search', () => {
    it('does not apply an .or() filter when the search query is empty', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '   ',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.or).not.toHaveBeenCalled();
    });

    it('applies a title/content ilike filter, stripped of wildcard/comma characters, when searching', async () => {
      const chain = buildChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '  50% off, deal*  ',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(chain.or).toHaveBeenCalledTimes(1);
      const filterArg = chain.or.mock.calls[0][0] as string;
      // '%' and '*' are stripped so a user's search text can't inject its own
      // ilike wildcards; ',' becomes a space since it's a PostgREST .or() delimiter.
      expect(filterArg).not.toContain('%');
      expect(filterArg.match(/\*/g)).toHaveLength(6); // only the 3 wrapping *pattern* markers, x2 (title + content)
      expect(filterArg).toContain('50 off  deal');
    });
  });

  describe('pagination', () => {
    it('reports hasNextPage=true when a full page comes back, and requests the next range on fetchNextPage', async () => {
      const fullPage = Array.from({ length: POSTS_PER_PAGE }, (_, i) => makePost(String(i)));
      const chain = buildChain({ data: fullPage, error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.hasNextPage).toBe(true);
      expect(chain.range).toHaveBeenCalledWith(0, POSTS_PER_PAGE - 1);

      await act(async () => {
        await result.current.fetchNextPage();
      });

      expect(chain.range).toHaveBeenCalledWith(POSTS_PER_PAGE, POSTS_PER_PAGE * 2 - 1);
    });

    it('reports hasNextPage=false when a partial (final) page comes back', async () => {
      const chain = buildChain({ data: [makePost('1'), makePost('2')], error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe('error handling', () => {
    it('surfaces a query error via isError/error', async () => {
      const chain = buildChain({ data: null, error: new Error('DB unavailable') });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(
        () =>
          useFeedPosts({
            filter: 'hot',
            activeSearchQuery: '',
            universityId: 'uni-1',
            communityId: null,
          }),
        { wrapper: createWrapper() },
      );

      // The hook hardcodes retry: 2, which the QueryClient's own
      // retry:false default can't override (query-level options win) — so
      // this genuinely retries with backoff before settling into an error.
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 8000 });
      expect((result.current.error as Error).message).toBe('DB unavailable');
    }, 10000);
  });
});
