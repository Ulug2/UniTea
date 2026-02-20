import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReportPost } from '../../../features/posts/hooks/useReportPost';

// ----- module mocks -------------------------------------------------------
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../../lib/supabase';

const mockFrom = supabase.from as jest.Mock;

// ----- helpers ------------------------------------------------------------

function buildInsertChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.insert = jest.fn(() => Promise.resolve(result));
  mockFrom.mockReturnValue(chain);
  return chain;
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// --------------------------------------------------------------------------

describe('useReportPost', () => {
  let alertSpy: jest.SpyInstance;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    queryClient.clear();
  });

  // ── null viewerId guard ───────────────────────────────────────────────
  describe('when viewerId is null', () => {
    it('throws "Missing user or post ID"', async () => {
      buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportPost({ postId: 'post-1', viewerId: null }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await expect(result.current.mutateAsync('spam')).rejects.toThrow(
          'Missing user or post ID',
        );
      });
    });
  });

  // ── null postId guard ─────────────────────────────────────────────────
  describe('when postId is null', () => {
    it('throws "Missing user or post ID"', async () => {
      buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportPost({ postId: null, viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await expect(result.current.mutateAsync('spam')).rejects.toThrow(
          'Missing user or post ID',
        );
      });
    });
  });

  // ── happy path ─────────────────────────────────────────────────────────
  describe('on successful report', () => {
    it('inserts a report with correct payload', async () => {
      const chain = buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportPost({ postId: 'post-abc', viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => { await result.current.mutateAsync('harassment'); });

      expect(mockFrom).toHaveBeenCalledWith('reports');
      expect(chain.insert).toHaveBeenCalledWith({
        reporter_id: 'viewer-1',
        post_id: 'post-abc',
        comment_id: null,
        reason: 'harassment',
      });
    });

    it('shows "Reported" alert on success', async () => {
      buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportPost({ postId: 'post-abc', viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => { await result.current.mutateAsync('spam'); });

      expect(alertSpy).toHaveBeenCalledWith('Reported', expect.any(String));
    });
  });

  // ── DB error ──────────────────────────────────────────────────────────
  describe('when supabase insert fails', () => {
    it('shows an "Error" alert', async () => {
      buildInsertChain({ data: null, error: { message: 'insert failed' } });

      const { result } = renderHook(
        () => useReportPost({ postId: 'post-bad', viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await result.current.mutateAsync('spam').catch(() => {});
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Error', expect.any(String));
      });
    });

    it('does not show "Reported" alert on error', async () => {
      buildInsertChain({ data: null, error: { message: 'oops' } });

      const { result } = renderHook(
        () => useReportPost({ postId: 'post-err', viewerId: 'v-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await result.current.mutateAsync('other').catch(() => {});
      });

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());

      expect(alertSpy).not.toHaveBeenCalledWith('Reported', expect.anything());
    });
  });
});
