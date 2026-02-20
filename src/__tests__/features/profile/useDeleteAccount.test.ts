jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() } }));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useDeleteAccount } from '../../../features/profile/hooks/useDeleteAccount';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

const mockUseAuth = useAuth as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockRouter = router as unknown as { replace: jest.Mock };

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockUser = { id: 'user-abc', email: 'test@uni.edu' };
const mockSession = { user: mockUser, access_token: 'mock-token' };

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  jest.clearAllMocks();

  // Default: logged-in session
  mockUseAuth.mockReturnValue({
    session: mockSession,
    loading: false,
    error: null,
    signOut: jest.fn(),
  });

  // Default: rpc and signOut succeed
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  queryClient.clear();
});

describe('useDeleteAccount', () => {
  // ── guards ───────────────────────────────────────────────────────────────────
  describe('guards', () => {
    it('throws "User ID missing" when session is null', async () => {
      mockUseAuth.mockReturnValue({
        session: null,
        loading: false,
        error: null,
        signOut: jest.fn(),
      });

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('User ID missing');
    });

    it('throws "User ID missing" when session.user.id is undefined', async () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: undefined }, access_token: 'tok' },
        loading: false,
        error: null,
        signOut: jest.fn(),
      });

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe('User ID missing');
    });
  });

  // ── happy path ───────────────────────────────────────────────────────────────
  describe('happy path', () => {
    it('calls supabase.rpc("delete_user_account")', async () => {
      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockRpc).toHaveBeenCalledWith('delete_user_account');
    });

    it('calls supabase.auth.signOut() after rpc succeeds', async () => {
      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('clears the QueryClient cache on success', async () => {
      // Pre-populate the cache with some data
      queryClient.setQueryData(['user-posts', 'user-abc'], [{ id: '1' }]);
      queryClient.setQueryData(['posts', 'feed'], [{ id: '2' }]);

      const clearSpy = jest.spyOn(queryClient, 'clear');

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(clearSpy).toHaveBeenCalledTimes(1);
    });

    it('navigates to /(auth) route on success', async () => {
      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)');
    });
  });

  // ── error handling ────────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('shows Alert.alert with error message when rpc fails', async () => {
      const rpcError = new Error('RPC failed: permission denied');
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError });

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'RPC failed: permission denied');
    });

    it('does NOT call signOut when rpc fails', async () => {
      const rpcError = new Error('DB error');
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError });

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('does NOT navigate to /(auth) when rpc fails', async () => {
      const rpcError = new Error('DB error');
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError });

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('does NOT clear queryClient cache on rpc failure', async () => {
      const rpcError = new Error('DB error');
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError });

      const clearSpy = jest.spyOn(queryClient, 'clear');

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('shows fallback Alert message for non-Error thrown values', async () => {
      // Simulate rpc throwing a plain object (non-Error)
      mockRpc.mockRejectedValueOnce('plain string rejection');

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      act(() => { result.current.mutate(); });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to delete account. Please try again.'
      );
    });
  });
});
