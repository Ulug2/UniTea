/**
 * Poll's readOnly mode (web post card preview): results still render, but
 * options can't be voted on and nothing is persisted locally. Paired with a
 * default-mode control so the press helper is proven to dispatch.
 */
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      border: '#eee',
      background: '#fff',
      primary: '#2FC9C1',
      text: '#000',
      secondaryText: '#666',
    },
  }),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));

const mockSavePollToStorage = jest.fn();
jest.mock('../../utils/feedPersistence', () => ({
  savePollToStorage: (...args: unknown[]) => mockSavePollToStorage(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import Poll from '../../components/Poll';

const mockFrom = supabase.from as jest.Mock;

const POLL = {
  id: 'poll-1',
  expires_at: null,
  allow_multiple: false,
  poll_options: [
    { id: 'opt-a', option_text: 'Option A', position: 0 },
    { id: 'opt-b', option_text: 'Option B', position: 1 },
  ],
  poll_votes: [{ id: 'v1', option_id: 'opt-b', user_id: 'someone' }],
};

function buildChain() {
  const chain: Record<string, any> = {};
  ['select', 'upsert', 'delete', 'eq', 'limit'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve({ data: null, error: null });
      return p.then.bind(p);
    },
  });
  return chain;
}

let queryClient: QueryClient;

function renderPoll(readOnly?: boolean) {
  queryClient.setQueryData(['poll', 'post-1', 'me'], POLL);
  return render(
    <QueryClientProvider client={queryClient}>
      <Poll postId="post-1" readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity }, mutations: { retry: false } },
  });
  jest.clearAllMocks();
  mockFrom.mockImplementation(() => buildChain());
});

afterEach(() => {
  queryClient.clear();
});

describe('Poll readOnly (web post card preview)', () => {
  it('default mode: pressing an option writes a vote and the poll is persisted (control)', async () => {
    renderPoll();
    expect(mockSavePollToStorage).toHaveBeenCalledWith('post-1', POLL);

    await act(async () => {
      fireEvent.press(screen.getByText('Option A'));
      await Promise.resolve();
    });
    expect(mockFrom).toHaveBeenCalledWith('poll_votes');
  });

  it('readOnly: shows results, but pressing an option writes nothing and nothing is persisted', async () => {
    renderPoll(true);
    expect(screen.getByText('Option A')).toBeTruthy();
    expect(screen.getByText('1 vote')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Option A'));
      fireEvent.press(screen.getByText('Option B'));
      await Promise.resolve();
    });

    expect(mockFrom).not.toHaveBeenCalledWith('poll_votes');
    expect(mockSavePollToStorage).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['poll', 'post-1', 'me'])).toEqual(POLL);
  });
});
