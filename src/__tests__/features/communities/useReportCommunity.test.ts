/**
 * Mirrors useReportPost.test.ts's structure (Phase 3.1B sibling hook).
 * Verifies the insert payload shape (community_id populated, post_id/
 * comment_id null, reporter_id = viewer) and that existing report error/
 * success/rate-limit UX carries over unchanged.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReportCommunity } from '../../../features/communities/hooks/useReportCommunity';

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../../lib/supabase';

const mockFrom = supabase.from as jest.Mock;

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

describe('useReportCommunity', () => {
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

  describe('when viewerId is null', () => {
    it('throws "Missing user or community ID"', async () => {
      buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportCommunity({ communityId: 'community-1', viewerId: null }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await expect(result.current.mutateAsync('spam')).rejects.toThrow(
          'Missing user or community ID',
        );
      });
    });
  });

  describe('when communityId is null', () => {
    it('throws "Missing user or community ID"', async () => {
      buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportCommunity({ communityId: null, viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await expect(result.current.mutateAsync('spam')).rejects.toThrow(
          'Missing user or community ID',
        );
      });
    });
  });

  describe('on successful report', () => {
    it('inserts a report with community_id populated and post_id/comment_id null', async () => {
      const chain = buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportCommunity({ communityId: 'community-abc', viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => { await result.current.mutateAsync('offensive name'); });

      expect(mockFrom).toHaveBeenCalledWith('reports');
      expect(chain.insert).toHaveBeenCalledWith({
        reporter_id: 'viewer-1',
        post_id: null,
        comment_id: null,
        community_id: 'community-abc',
        reason: 'offensive name',
      });
    });

    it('shows "Reported" alert on success', async () => {
      buildInsertChain({ data: null, error: null });

      const { result } = renderHook(
        () => useReportCommunity({ communityId: 'community-abc', viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => { await result.current.mutateAsync('spam'); });

      expect(alertSpy).toHaveBeenCalledWith('Reported', expect.any(String));
    });
  });

  describe('when supabase insert fails', () => {
    it('shows an "Error" alert', async () => {
      buildInsertChain({ data: null, error: { message: 'insert failed' } });

      const { result } = renderHook(
        () => useReportCommunity({ communityId: 'community-bad', viewerId: 'viewer-1' }),
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
        () => useReportCommunity({ communityId: 'community-err', viewerId: 'v-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await result.current.mutateAsync('other').catch(() => {});
      });

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());

      expect(alertSpy).not.toHaveBeenCalledWith('Reported', expect.anything());
    });
  });

  describe('when the report rate limit is hit', () => {
    it('shows the "Slow down" alert instead of a generic error', async () => {
      buildInsertChain({
        data: null,
        error: new Error('rate_limit_exceeded'),
      });

      const { result } = renderHook(
        () => useReportCommunity({ communityId: 'community-1', viewerId: 'viewer-1' }),
        { wrapper: wrapper(queryClient) },
      );

      await act(async () => {
        await result.current.mutateAsync('spam').catch(() => {});
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Slow down',
          expect.stringContaining('too quickly'),
        );
      });
    });
  });
});
