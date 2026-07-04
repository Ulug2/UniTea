jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn(), auth: { getSession: jest.fn() } },
}));
jest.mock('../../../utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../../utils/activityLogger', () => ({ logActivity: jest.fn() }));

const originalFetch = global.fetch;

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import {
  useCreateCommunity,
  useUpdateCommunity,
  useDeleteCommunity,
} from '../../../features/communities/hooks/useCommunityMutations';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

const mockUseAuth = useAuth as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;

function buildChain(result: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['update', 'delete', 'select', 'eq'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.single = jest.fn().mockResolvedValue(result);
  Object.defineProperty(chain, 'then', {
    get: () => Promise.resolve(result).then.bind(Promise.resolve(result)),
    configurable: true,
  });
  return chain;
}

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockUseAuth.mockReturnValue({ session: { user: { id: 'me' } } });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  global.fetch = jest.fn();
});

afterEach(() => {
  queryClient.clear();
  global.fetch = originalFetch;
});

describe('useCreateCommunity', () => {
  it('throws without calling the Edge Function when the user is not logged in', async () => {
    mockUseAuth.mockReturnValue({ session: null });
    const { result } = renderHook(() => useCreateCommunity(), { wrapper: createWrapper() });

    act(() => result.current.mutate({ name: 'Chess Club' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('You must be logged in.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs the normalized name/description to the create-community function with the auth token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ id: 'c1', university_id: 'uni-1' }),
    });

    const { result } = renderHook(() => useCreateCommunity(), { wrapper: createWrapper() });

    act(() => result.current.mutate({ name: '  Chess Club  ', description: '  fun  ' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      'https://proj.supabase.co/functions/v1/create-community',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({ name: 'Chess Club', description: 'fun', avatar_url: null }),
      }),
    );
  });

  it('marks the error as a rate limit on a 429 response and shows the rate-limit Alert', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 429,
      ok: false,
      json: async () => ({ error: 'slow down' }),
    });

    const { result } = renderHook(() => useCreateCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ name: 'Chess Club' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Slow down',
      "You're creating communities too quickly. Please wait before trying again.",
    );
  });

  it('shows a friendly duplicate-name message for a duplicate key error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({ error: 'duplicate key value violates unique constraint' }),
    });

    const { result } = renderHook(() => useCreateCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ name: 'Chess Club' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'A community with this name already exists at your university.',
    );
  });
});

describe('useUpdateCommunity', () => {
  it('updates name/description/avatar and returns the updated row', async () => {
    const chain = buildChain({
      data: { id: 'c1', name: 'New Name', description: 'New desc', avatar_url: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useUpdateCommunity(), { wrapper: createWrapper() });
    act(() =>
      result.current.mutate({ id: 'c1', name: '  New Name  ', description: '  New desc  ' }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name', description: 'New desc' }),
    );
  });

  it('shows an Alert with the error message on failure', async () => {
    const chain = buildChain({ data: null, error: new Error('not the creator') });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useUpdateCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ id: 'c1', name: 'New Name' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'not the creator');
  });
});

describe('useDeleteCommunity', () => {
  it('deletes the community by id', async () => {
    const chain = buildChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDeleteCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate('c1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('shows an Alert on failure', async () => {
    const chain = buildChain({ data: null, error: new Error('RLS denied') });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDeleteCommunity(), { wrapper: createWrapper() });
    act(() => result.current.mutate('c1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not delete the community. Please try again.',
    );
  });
});
