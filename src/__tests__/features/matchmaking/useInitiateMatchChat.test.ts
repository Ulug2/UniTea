jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useInitiateMatchChat } from '../../../features/matchmaking/hooks/useInitiateMatchChat';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

const mockUseAuth = useAuth as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

const CURRENT_USER = 'aaaaaaaa-0000-0000-0000-000000000001';
const PARTNER = 'bbbbbbbb-0000-0000-0000-000000000002';

function buildChain(terminalResult: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['select', 'insert', 'eq', 'is'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.single = jest.fn().mockResolvedValue(terminalResult);
  chain.maybeSingle = jest.fn().mockResolvedValue(terminalResult);
  return chain;
}

let queryClient: QueryClient;
let alertSpy: jest.SpyInstance;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockUseAuth.mockReturnValue({ session: { user: { id: CURRENT_USER } } });
});

afterEach(() => {
  queryClient.clear();
});

describe('useInitiateMatchChat', () => {
  it('throws when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null });
    const { result } = renderHook(() => useInitiateMatchChat(), { wrapper: createWrapper() });

    act(() => result.current.mutate({ partnerUserId: PARTNER }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Not authenticated');
  });

  it('throws when trying to chat with yourself', async () => {
    const { result } = renderHook(() => useInitiateMatchChat(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ partnerUserId: CURRENT_USER }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Cannot chat with yourself');
  });

  it('scopes the lookup/insert to post_id IS NULL — this is a matchmaking chat, not a post chat', async () => {
    const chain = buildChain({ data: { id: 'chat-1' }, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useInitiateMatchChat(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ partnerUserId: PARTNER }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.is).toHaveBeenCalledWith('post_id', null);
  });

  it('returns an existing chat without inserting when one already exists', async () => {
    const selectChain = buildChain({ data: { id: 'existing' }, error: null });
    mockFrom.mockReturnValueOnce(selectChain);

    const { result } = renderHook(() => useInitiateMatchChat(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ partnerUserId: PARTNER }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ chatId: 'existing' });
    expect(selectChain.insert).not.toHaveBeenCalled();
  });

  it('recovers from a 23505 race by re-selecting the row the other request created', async () => {
    const selectChain = buildChain({ data: null, error: null });
    const insertChain = buildChain({ data: null, error: { code: '23505', message: 'dup' } });
    const recoveryChain = buildChain({ data: { id: 'raced' }, error: null });
    mockFrom
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(recoveryChain);

    const { result } = renderHook(() => useInitiateMatchChat(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ partnerUserId: PARTNER }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ chatId: 'raced' });
  });

  it('shows the rate-limit Alert only for a rate-limit error', async () => {
    const selectChain = buildChain({
      data: null,
      error: new Error('rate_limit_exceeded'),
    });
    mockFrom.mockReturnValue(selectChain);

    const { result } = renderHook(() => useInitiateMatchChat(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ partnerUserId: PARTNER }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(alertSpy).toHaveBeenCalledWith(
      'Slow down',
      "You're starting too many chats. Please wait a moment before trying again.",
    );
  });
});
