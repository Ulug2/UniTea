import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUnblockAll } from '../../../features/blocks/hooks/useUnblockAll';

// ----- module mocks -------------------------------------------------------
jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

const mockUseAuth = useAuth as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

// ----- helpers ------------------------------------------------------------

function buildDeleteChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.delete = jest.fn(() => chain);
  chain.eq = jest.fn(() => Promise.resolve(result));
  mockFrom.mockReturnValue(chain);
  return chain;
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// --------------------------------------------------------------------------

describe('useUnblockAll', () => {
  let alertSpy: jest.SpyInstance;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUseAuth.mockReturnValue({ session: { user: { id: 'user-abc' } } });
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    queryClient.clear();
  });

  // ── null session guard ────────────────────────────────────────────────
  describe('when session is null', () => {
    it('throws "User ID missing"', async () => {
      mockUseAuth.mockReturnValue({ session: null });
      buildDeleteChain({ data: null, error: null });

      const { result } = renderHook(() => useUnblockAll(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await expect(result.current.mutateAsync()).rejects.toThrow('User ID missing');
      });
    });
  });

  // ── happy path ─────────────────────────────────────────────────────────
  describe('on successful unblock', () => {
    it('calls supabase.from("blocks").delete().eq("blocker_id", userId)', async () => {
      const chain = buildDeleteChain({ data: null, error: null });

      const { result } = renderHook(() => useUnblockAll(), { wrapper: wrapper(queryClient) });

      await act(async () => { await result.current.mutateAsync(); });

      expect(mockFrom).toHaveBeenCalledWith('blocks');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('blocker_id', 'user-abc');
    });

    it('invalidates all 6 expected query keys', async () => {
      buildDeleteChain({ data: null, error: null });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUnblockAll(), { wrapper: wrapper(queryClient) });

      await act(async () => { await result.current.mutateAsync(); });

      const keys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown[] }).queryKey[0],
      );
      expect(keys).toContain('blocks');
      expect(keys).toContain('posts');
      expect(keys).toContain('comments');
      expect(keys).toContain('chat-messages');
      expect(keys).toContain('chat-summaries');
      expect(keys).toContain('global-unread-count');
    });

    it('does not show an error alert on success', async () => {
      buildDeleteChain({ data: null, error: null });

      const { result } = renderHook(() => useUnblockAll(), { wrapper: wrapper(queryClient) });

      await act(async () => { await result.current.mutateAsync(); });

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  // ── DB error ──────────────────────────────────────────────────────────
  describe('when supabase delete fails', () => {
    it('shows an "Error" alert', async () => {
      buildDeleteChain({ data: null, error: { message: 'delete failed' } });

      const { result } = renderHook(() => useUnblockAll(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync().catch(() => {});
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Error', expect.any(String));
      });
    });

    it('does NOT invalidate queries on error', async () => {
      buildDeleteChain({ data: null, error: { message: 'fail' } });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUnblockAll(), { wrapper: wrapper(queryClient) });

      await act(async () => { await result.current.mutateAsync().catch(() => {}); });

      // onError is called; onSuccess (with invalidations) should NOT be called
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
