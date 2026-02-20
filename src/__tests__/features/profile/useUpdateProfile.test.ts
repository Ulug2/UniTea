import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateProfile } from '../../../features/profile/hooks/useUpdateProfile';

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

function buildChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.update = jest.fn(() => chain);
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

describe('useUpdateProfile', () => {
  let alertSpy: jest.SpyInstance;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUseAuth.mockReturnValue({ session: { user: { id: 'user-123' } } });
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    queryClient.clear();
  });

  // ── no session guard ───────────────────────────────────────────────────
  describe('when session is null', () => {
    it('mutationFn throws "User ID missing"', async () => {
      mockUseAuth.mockReturnValue({ session: null });
      // chain won't be called but we still need from() mock
      buildChain({ data: null, error: null });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await expect(
          result.current.mutateAsync({ username: 'test' }),
        ).rejects.toThrow('User ID missing');
      });
    });
  });

  // ── happy path ─────────────────────────────────────────────────────────
  describe('on successful mutation', () => {
    it('calls supabase.from("profiles").update().eq() with correct args', async () => {
      const chain = buildChain({ data: null, error: null });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => { await result.current.mutateAsync({ username: 'newname' }); });

      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(chain.update).toHaveBeenCalledWith({ username: 'newname' });
      expect(chain.eq).toHaveBeenCalledWith('id', 'user-123');
    });

    it('invalidates current-user-profile on success', async () => {
      buildChain({ data: null, error: null });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => { await result.current.mutateAsync({ username: 'x' }); });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['current-user-profile'] }),
      );
    });

    it('always invalidates chat-summaries, chat-users, chat-other-user on success', async () => {
      buildChain({ data: null, error: null });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });
      await act(async () => { await result.current.mutateAsync({ username: 'x' }); });

      const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
      expect(keys).toContain('chat-summaries');
      expect(keys).toContain('chat-users');
      expect(keys).toContain('chat-other-user');
    });

    it('does NOT invalidate posts/user-posts when only username changes', async () => {
      buildChain({ data: null, error: null });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });
      await act(async () => { await result.current.mutateAsync({ username: 'noavatar' }); });

      const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
      expect(keys).not.toContain('posts');
      expect(keys).not.toContain('user-posts');
    });

    it('invalidates posts and user-posts when avatar_url changes', async () => {
      buildChain({ data: null, error: null });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });
      await act(async () => { await result.current.mutateAsync({ avatar_url: 'https://cdn.example/img.webp' }); });

      const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
      expect(keys).toContain('posts');
      expect(keys).toContain('user-posts');
    });

    it('does not show an error alert on success', async () => {
      buildChain({ data: null, error: null });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });
      await act(async () => { await result.current.mutateAsync({ username: 'clean' }); });

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  // ── optimistic update ──────────────────────────────────────────────────
  describe('optimistic update (onMutate)', () => {
    it('applies optimistic update before mutationFn resolves', async () => {
      const previousProfile = { id: 'user-123', username: 'old', avatar_url: null };
      queryClient.setQueryData(['current-user-profile'], previousProfile);

      // Delay resolution so we can check mid-flight state
      let resolveUpdate!: () => void;
      const chain: Record<string, jest.Mock> = {};
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(
        () => new Promise<{ data: null; error: null }>((res) => { resolveUpdate = () => res({ data: null, error: null }); }),
      );
      mockFrom.mockReturnValue(chain);

      const setDataSpy = jest.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      act(() => { void result.current.mutate({ username: 'new-name' }); });

      // onMutate fires synchronously before the async mutationFn
      await waitFor(() => {
        expect(setDataSpy).toHaveBeenCalledWith(
          ['current-user-profile'],
          expect.objectContaining({ username: 'new-name' }),
        );
      });

      // Release the pending update
      await act(async () => { resolveUpdate(); });
    });
  });

  // ── rollback on error ──────────────────────────────────────────────────
  describe('when mutation fails', () => {
    it('rolls back optimistic update to previous value', async () => {
      const previousProfile = { id: 'user-123', username: 'original', avatar_url: null };
      queryClient.setQueryData(['current-user-profile'], previousProfile);

      const chain: Record<string, jest.Mock> = {};
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(() => Promise.resolve({ data: null, error: { message: 'DB fail' } }));
      mockFrom.mockReturnValue(chain);

      const setDataSpy = jest.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync({ username: 'bad' }).catch(() => {});
      });

      const rollbackCall = setDataSpy.mock.calls.find(
        ([key, val]) =>
          Array.isArray(key) &&
          key[0] === 'current-user-profile' &&
          (val as { username?: string })?.username === 'original',
      );
      expect(rollbackCall).toBeDefined();
    });

    it('shows an alert with the error message', async () => {
      const chain: Record<string, jest.Mock> = {};
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(() => Promise.resolve({ data: null, error: { message: 'update failed' } }));
      mockFrom.mockReturnValue(chain);
      queryClient.setQueryData(['current-user-profile'], { id: 'user-123', username: 'x' });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync({ username: 'y' }).catch(() => {});
      });

      expect(alertSpy).toHaveBeenCalledWith('Error', expect.any(String));
    });
  });
});
