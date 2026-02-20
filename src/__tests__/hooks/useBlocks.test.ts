/**
 * Tests for src/hooks/useBlocks.ts
 */

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBlocks } from '../../hooks/useBlocks';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// ── test wrapper ─────────────────────────────────────────────────────────────
let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ── supabase chain builder ────────────────────────────────────────────────────
function buildSelectChain(rows: Array<Record<string, string>>) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    // Make the chain awaitable (Promise-like)
    then: (resolve: any, reject?: any) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    catch: (reject: any) =>
      Promise.resolve({ data: rows, error: null }).catch(reject),
  };
  return chain;
}

const mockFrom = supabase.from as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    session: { user: { id: 'current-user', email: 'me@uni.edu' } },
    loading: false,
    error: null,
    signOut: jest.fn(),
  });
});

afterEach(() => {
  queryClient.clear();
});

describe('useBlocks', () => {
  it('returns empty array when current user has no blocks', async () => {
    mockFrom.mockReturnValue(buildSelectChain([]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns IDs of users blocked by the current user', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([{ blocked_id: 'user-A' }, { blocked_id: 'user-B' }]))
      .mockReturnValueOnce(buildSelectChain([]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toContain('user-A');
    expect(result.current.data).toContain('user-B');
  });

  it('returns IDs of users who have blocked the current user', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([]))
      .mockReturnValueOnce(buildSelectChain([{ blocker_id: 'user-C' }]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toContain('user-C');
  });

  it('merges both directions without duplicates', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([{ blocked_id: 'user-X' }, { blocked_id: 'user-Y' }]))
      .mockReturnValueOnce(buildSelectChain([{ blocker_id: 'user-X' }, { blocker_id: 'user-Z' }]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.filter((id) => id === 'user-X')).toHaveLength(1);
    expect(data).toContain('user-Y');
    expect(data).toContain('user-Z');
    expect(data).toHaveLength(3);
  });

  it('is disabled when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false, error: null, signOut: jest.fn() });
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isSuccess).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('still resolves when one sub-query returns an error', async () => {
    const errorChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: any) =>
        Promise.resolve({ data: null, error: { message: 'DB error' } }).then(resolve),
      catch: () => {},
    };
    mockFrom
      .mockReturnValueOnce(buildSelectChain([{ blocked_id: 'user-A' }]))
      .mockReturnValueOnce(errorChain);
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toContain('user-A');
  });
});
