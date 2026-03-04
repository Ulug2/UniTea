/**
 * Tests for src/hooks/useBlocks.ts
 */

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBlocks, type BlockRecord } from '../../hooks/useBlocks';
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

  it('returns BlockRecords for users blocked by the current user', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([
        { blocked_id: 'user-A', block_scope: 'profile_only' },
        { blocked_id: 'user-B', block_scope: 'anonymous_only' },
      ]))
      .mockReturnValueOnce(buildSelectChain([]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.some((r) => r.userId === 'user-A' && r.scope === 'profile_only')).toBe(true);
    expect(data.some((r) => r.userId === 'user-B' && r.scope === 'anonymous_only')).toBe(true);
  });

  it('returns profile_only BlockRecord for users who blocked the current user', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([]))
      .mockReturnValueOnce(buildSelectChain([{ blocker_id: 'user-C', block_scope: 'profile_only' }]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.some((r) => r.userId === 'user-C' && r.scope === 'profile_only')).toBe(true);
  });

  it('merges both directions without duplicates', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([
        { blocked_id: 'user-X', block_scope: 'profile_only' },
        { blocked_id: 'user-Y', block_scope: 'profile_only' },
      ]))
      .mockReturnValueOnce(buildSelectChain([
        { blocker_id: 'user-X', block_scope: 'profile_only' },
        { blocker_id: 'user-Z', block_scope: 'profile_only' },
      ]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.filter((r) => r.userId === 'user-X')).toHaveLength(1);
    expect(data.some((r) => r.userId === 'user-Y')).toBe(true);
    expect(data.some((r) => r.userId === 'user-Z')).toBe(true);
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
      .mockReturnValueOnce(buildSelectChain([{ blocked_id: 'user-A', block_scope: 'profile_only' }]))
      .mockReturnValueOnce(errorChain);
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.some((r) => r.userId === 'user-A')).toBe(true);
  });
});
