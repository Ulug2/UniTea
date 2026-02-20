/**
 * Tests for src/features/profile/hooks/useMyProfile.ts
 */

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn(),
    },
  },
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useMyProfile } from '../../../features/profile/hooks/useMyProfile';

const mockFrom = supabase.from as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;

function buildChain(terminalResult: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['select', 'eq', 'order', 'limit', 'in'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(terminalResult);
  chain['maybeSingle'] = jest.fn().mockResolvedValue(terminalResult);
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve(terminalResult);
      return p.then.bind(p);
    },
    configurable: true,
  });
  return chain;
}

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockProfile = { id: 'user-1', username: 'alice', email: 'alice@uni.edu' };

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, retryDelay: 0 } },
  });
  jest.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

describe('useMyProfile', () => {
  describe('with explicit userId', () => {
    it('queries profiles table with the provided userId', async () => {
      const chain = buildChain({ data: mockProfile, error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(() => useMyProfile('user-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');
      expect(result.current.data).toEqual(mockProfile);
    });
  });

  describe('with userId=undefined (falls back to session)', () => {
    it('fetches session first then queries profiles', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'session-user' } } },
      });
      const chain = buildChain({ data: { ...mockProfile, id: 'session-user' }, error: null });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(() => useMyProfile(undefined), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGetSession).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'session-user');
    });

    it('returns null when no session and no userId', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const { result } = renderHook(() => useMyProfile(undefined), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });
  });

  describe('error handling', () => {
    it('isError is true when supabase returns an error', async () => {
      const chain = buildChain({ data: null, error: new Error('db error') });
      mockFrom.mockReturnValue(chain);

      const { result } = renderHook(() => useMyProfile('user-err'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
