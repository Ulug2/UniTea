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
        expect.objectContaining({ queryKey: ['current-user-profile', 'user-123'] }),
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

    it('invalidates posts and user-posts when avatar_url is cleared to null (delete-avatar case)', async () => {
      buildChain({ data: null, error: null });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });
      await act(async () => { await result.current.mutateAsync({ avatar_url: null }); });

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
      queryClient.setQueryData(['current-user-profile', 'user-123'], previousProfile);

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
          ['current-user-profile', 'user-123'],
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
      queryClient.setQueryData(['current-user-profile', 'user-123'], previousProfile);

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
      queryClient.setQueryData(['current-user-profile', 'user-123'], { id: 'user-123', username: 'x' });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync({ username: 'y' }).catch(() => {});
      });

      expect(alertSpy).toHaveBeenCalledWith('Error', expect.any(String));
    });
  });

  // ── Phase 7.6.1: Postgres error-code mapping for username validation ────
  describe('username validation error mapping (Phase 7.6.1)', () => {
    it('maps a unique_violation (23505) — profiles_username_unique_ci — to a friendly "already taken" message', async () => {
      const chain: Record<string, jest.Mock> = {};
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_profiles_username_unique_ci"' },
        }),
      );
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync({ username: 'taken' }).catch(() => {});
      });

      expect(alertSpy).toHaveBeenCalledWith('Error', 'That username is already taken. Please choose another.');
    });

    it('maps a check_violation (23514) — profiles_username_format_check — to a friendly format message', async () => {
      const chain: Record<string, jest.Mock> = {};
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: '23514', message: 'new row for relation "profiles" violates check constraint "profiles_username_format_check"' },
        }),
      );
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync({ username: 'a' }).catch(() => {});
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Username must be 3-20 characters, using only letters, numbers, and underscores.',
      );
    });

    it('does not apply the username-specific friendly messages to an unrelated error code', async () => {
      const chain: Record<string, jest.Mock> = {};
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(() =>
        Promise.resolve({ data: null, error: { code: '08006', message: 'connection failure' } }),
      );
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync({ username: 'z' }).catch(() => {});
      });

      const [, shownMessage] = alertSpy.mock.calls[0];
      expect(shownMessage).not.toBe('That username is already taken. Please choose another.');
      expect(shownMessage).not.toBe(
        'Username must be 3-20 characters, using only letters, numbers, and underscores.',
      );
    });

    it('still rolls back the optimistic update for a mapped username error', async () => {
      const previousProfile = { id: 'user-123', username: 'original', avatar_url: null };
      queryClient.setQueryData(['current-user-profile', 'user-123'], previousProfile);

      const chain: Record<string, jest.Mock> = {};
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(() =>
        Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }),
      );
      mockFrom.mockReturnValue(chain);

      const setDataSpy = jest.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(queryClient) });

      await act(async () => {
        await result.current.mutateAsync({ username: 'taken' }).catch(() => {});
      });

      const rollbackCall = setDataSpy.mock.calls.find(
        ([key, val]) =>
          Array.isArray(key) &&
          key[0] === 'current-user-profile' &&
          (val as { username?: string })?.username === 'original',
      );
      expect(rollbackCall).toBeDefined();
    });
  });
});
