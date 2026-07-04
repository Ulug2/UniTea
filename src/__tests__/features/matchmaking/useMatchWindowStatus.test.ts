jest.mock('../../../features/matchmaking/data/queries', () => ({
  fetchMatchWindow: jest.fn(),
}));

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMatchWindowStatus } from '../../../features/matchmaking/hooks/useMatchWindowStatus';
import { fetchMatchWindow } from '../../../features/matchmaking/data/queries';

const mockFetchMatchWindow = fetchMatchWindow as jest.Mock;

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

describe('useMatchWindowStatus', () => {
  it('returns a not-expired, zero-remaining default when there is no userId', () => {
    const { result } = renderHook(() => useMatchWindowStatus(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current).toEqual({
      viewed_at: null,
      window_expires_at: null,
      isExpired: false,
      msRemaining: 0,
    });
    expect(mockFetchMatchWindow).not.toHaveBeenCalled();
  });

  it('computes msRemaining and isExpired=false for a window that has not expired', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mockFetchMatchWindow.mockResolvedValue({ viewed_at: '2026-01-01T00:00:00Z', window_expires_at: expiresAt });

    const { result } = renderHook(() => useMatchWindowStatus('u1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.window_expires_at).toBe(expiresAt));
    expect(result.current.isExpired).toBe(false);
    expect(result.current.msRemaining).toBeGreaterThan(0);
  });

  it('reports isExpired=true and msRemaining=0 for a window already in the past', async () => {
    const expiresAt = new Date(Date.now() - 60_000).toISOString();
    mockFetchMatchWindow.mockResolvedValue({ viewed_at: '2026-01-01T00:00:00Z', window_expires_at: expiresAt });

    const { result } = renderHook(() => useMatchWindowStatus('u1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.window_expires_at).toBe(expiresAt));
    expect(result.current.isExpired).toBe(true);
    expect(result.current.msRemaining).toBe(0);
  });

  it('counts down msRemaining every second while the window is open', async () => {
    const expiresAt = new Date(Date.now() + 3000).toISOString();
    mockFetchMatchWindow.mockResolvedValue({ viewed_at: null, window_expires_at: expiresAt });

    const { result } = renderHook(() => useMatchWindowStatus('u1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.window_expires_at).toBe(expiresAt));
    const initialRemaining = result.current.msRemaining;

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.msRemaining).toBeLessThan(initialRemaining);
  });

  it('flips to isExpired=true once the countdown reaches zero', async () => {
    const expiresAt = new Date(Date.now() + 1000).toISOString();
    mockFetchMatchWindow.mockResolvedValue({ viewed_at: null, window_expires_at: expiresAt });

    const { result } = renderHook(() => useMatchWindowStatus('u1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.window_expires_at).toBe(expiresAt));

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(result.current.isExpired).toBe(true);
    expect(result.current.msRemaining).toBe(0);
  });
});
