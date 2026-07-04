jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../hooks/useBlocks', () => ({ useBlocks: jest.fn() }));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGlobalUnreadCount } from '../../hooks/useGlobalUnreadCount';
import { useAuth } from '../../context/AuthContext';
import { useBlocks } from '../../hooks/useBlocks';
import { supabase } from '../../lib/supabase';

const mockUseAuth = useAuth as jest.Mock;
const mockUseBlocks = useBlocks as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

const CURRENT_USER = 'user-me';

function buildChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, any> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.or = jest.fn().mockResolvedValue(result);
  return chain;
}

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ session: { user: { id: CURRENT_USER } } });
  mockUseBlocks.mockReturnValue({ data: [] });
});

afterEach(() => {
  queryClient.clear();
});

describe('useGlobalUnreadCount', () => {
  it('returns 0 without querying when there is no current user', async () => {
    mockUseAuth.mockReturnValue({ session: null });

    const { result } = renderHook(() => useGlobalUnreadCount(), { wrapper: createWrapper() });

    expect(result.current).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sums unread_count_p1 for chats where the current user is participant_1', async () => {
    const chain = buildChain({
      data: [
        { participant_1_id: CURRENT_USER, participant_2_id: 'other-1', unread_count_p1: 3, unread_count_p2: 9 },
        { participant_1_id: CURRENT_USER, participant_2_id: 'other-2', unread_count_p1: 2, unread_count_p2: 0 },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useGlobalUnreadCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(5));
  });

  it('sums unread_count_p2 for chats where the current user is participant_2', async () => {
    const chain = buildChain({
      data: [
        { participant_1_id: 'other-1', participant_2_id: CURRENT_USER, unread_count_p1: 9, unread_count_p2: 4 },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useGlobalUnreadCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(4));
  });

  it('excludes unread counts from chats with a blocked user, regardless of block scope', async () => {
    mockUseBlocks.mockReturnValue({
      data: [{ userId: 'blocked-user', scope: 'profile_only' }],
    });
    const chain = buildChain({
      data: [
        { participant_1_id: CURRENT_USER, participant_2_id: 'blocked-user', unread_count_p1: 10, unread_count_p2: 0 },
        { participant_1_id: CURRENT_USER, participant_2_id: 'ok-user', unread_count_p1: 2, unread_count_p2: 0 },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useGlobalUnreadCount(), { wrapper: createWrapper() });

    // Only the non-blocked chat's 2 unread messages should count.
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('treats a missing unread count field as 0 rather than NaN', async () => {
    const chain = buildChain({
      data: [{ participant_1_id: CURRENT_USER, participant_2_id: 'other', unread_count_p1: null, unread_count_p2: null }],
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useGlobalUnreadCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(0));
  });
});
