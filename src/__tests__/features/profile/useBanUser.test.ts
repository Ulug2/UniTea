/**
 * Tests for src/features/profile/hooks/useBanUser.ts
 */

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useBanUser } from '../../../features/profile/hooks/useBanUser';

const mockGetSession = supabase.auth.getSession as jest.Mock;

// Set env vars used by the hook
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const validSession = {
  data: { session: { access_token: 'tok-123', user: { id: 'admin-1' } } },
};

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockGetSession.mockResolvedValue(validSession);

  // Default: fetch succeeds
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('useBanUser', () => {
  it('throws when no session is available', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useBanUser(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ userId: 'u1', duration: '10_days' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('logged in');
  });

  it('calls fetch with correct Edge Function URL and body', async () => {
    const { result } = renderHook(() => useBanUser(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ userId: 'target-user', duration: '1_month' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fake.supabase.co/functions/v1/ban-user',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok-123',
        }),
        body: JSON.stringify({ user_id: 'target-user', duration: '1_month' }),
      })
    );
  });

  it('calls Alert.alert when response is not ok', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Admin only' }),
    });

    const { result } = renderHook(() => useBanUser(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ userId: 'u2', duration: 'permanent' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
  });

  it('invalidates user-profile, current-user-profile and profile queries on success', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useBanUser(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ userId: 'target-u', duration: '1_year' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey?.[0]);
    expect(keys).toContain('user-profile');
    expect(keys).toContain('current-user-profile');
    expect(keys).toContain('profile');
  });
});
