jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../../utils/logger', () => ({ logger: { error: jest.fn() } }));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import {
  useJoinCommunity,
  useLeaveCommunity,
} from '../../../features/communities/hooks/useCommunityMembership';
import { communityKeys } from '../../../features/communities/data/queryKeys';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import type { Community } from '../../../features/communities/types';

const mockUseAuth = useAuth as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

const USER_ID = 'me';
const community: Community = {
  id: 'c1',
  name: 'Chess Club',
  description: null,
  avatar_url: null,
  university_id: 'uni-1',
  created_by: 'someone-else',
  created_at: new Date().toISOString(),
};

function buildChain(result: { error: any }) {
  const chain: Record<string, any> = {};
  chain.upsert = jest.fn().mockResolvedValue(result);
  chain.delete = jest.fn().mockReturnValue(chain);
  // Last .eq() in the leave chain resolves.
  let eqCallCount = 0;
  chain.eq = jest.fn(() => {
    eqCallCount += 1;
    return eqCallCount >= 2 ? Promise.resolve(result) : chain;
  });
  return chain;
}

let queryClient: QueryClient;

/** Captures every setQueryData call for the given key so optimistic-update
 * and rollback values can be inspected even though gcTime:0 means an
 * unobserved cache entry can be collected before a later getQueryData call
 * would see it — see the identical pattern in useCreatePostMutation.test.ts. */
function captureSetQueryDataCalls(key: readonly unknown[]) {
  const calls: unknown[] = [];
  const original = queryClient.setQueryData.bind(queryClient);
  jest.spyOn(queryClient, 'setQueryData').mockImplementation((k: any, value: any) => {
    if (JSON.stringify(k) === JSON.stringify(key)) {
      // Read (never write) the pre-update value to resolve a functional
      // updater, so peeking doesn't itself mutate the cache.
      const prev = queryClient.getQueryData(k);
      const resolved = typeof value === 'function' ? value(prev) : value;
      calls.push(resolved);
    }
    return original(k, value);
  });
  return calls;
}

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockUseAuth.mockReturnValue({ session: { user: { id: USER_ID } } });
});

afterEach(() => {
  queryClient.clear();
});

describe('useJoinCommunity', () => {
  it('upserts membership with ignoreDuplicates so a double-tap never throws a duplicate-key error', async () => {
    const chain = buildChain({ error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useJoinCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate(community));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.upsert).toHaveBeenCalledWith(
      { community_id: 'c1', user_id: USER_ID },
      { onConflict: 'community_id,user_id', ignoreDuplicates: true },
    );
  });

  it('optimistically adds the community to the cache, without duplicating an already-present entry', async () => {
    queryClient.setQueryData(communityKeys.mine(USER_ID), [community]);
    const key = communityKeys.mine(USER_ID);
    const calls = captureSetQueryDataCalls(key);
    const chain = buildChain({ error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useJoinCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate(community));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // First captured update is the optimistic one from onMutate — the
    // already-present community should not be duplicated.
    expect(calls[0]).toEqual([community]);
  });

  it('rolls back the optimistic cache update and shows an Alert on failure', async () => {
    queryClient.setQueryData(communityKeys.mine(USER_ID), []);
    const key = communityKeys.mine(USER_ID);
    const calls = captureSetQueryDataCalls(key);
    const chain = buildChain({ error: new Error('insert failed') });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useJoinCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate(community));

    await waitFor(() => expect(result.current.isError).toBe(true));

    // onMutate optimistically adds the community, onError rolls back to [].
    expect(calls[0]).toEqual([community]);
    expect(calls[calls.length - 1]).toEqual([]);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not join the community. Please try again.',
    );
  });
});

describe('useLeaveCommunity', () => {
  it('deletes the membership row scoped to community and user', async () => {
    const chain = buildChain({ error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useLeaveCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate('c1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.delete).toHaveBeenCalled();
  });

  it('optimistically removes the community from the cache', async () => {
    queryClient.setQueryData(communityKeys.mine(USER_ID), [community]);
    const key = communityKeys.mine(USER_ID);
    const calls = captureSetQueryDataCalls(key);
    const chain = buildChain({ error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useLeaveCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate('c1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toEqual([]);
  });

  it('rolls back the optimistic removal and shows an Alert on failure', async () => {
    queryClient.setQueryData(communityKeys.mine(USER_ID), [community]);
    const key = communityKeys.mine(USER_ID);
    const calls = captureSetQueryDataCalls(key);
    const chain = buildChain({ error: new Error('delete failed') });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useLeaveCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate('c1'));

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(calls[0]).toEqual([]);
    expect(calls[calls.length - 1]).toEqual([community]);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not leave the community. Please try again.',
    );
  });
});
