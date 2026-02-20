/**
 * Tests for src/features/comments/hooks/usePostComments.ts
 */

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { usePostComments } from '../../../features/comments/hooks/usePostComments';

const mockFrom = supabase.from as jest.Mock;

// ── chain builders ────────────────────────────────────────────────────────────

function buildListChain(items: any[], error: any = null) {
  const chain: Record<string, any> = {};
  ['select', 'eq', 'order', 'in', 'limit', 'filter', 'not'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve({ data: items, error });
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

const fakeComment = {
  id: 'c1',
  post_id: 'p1',
  user_id: 'u1',
  content: 'Hello',
  created_at: new Date().toISOString(),
  parent_comment_id: null,
  is_deleted: false,
};

const fakeProfile = { id: 'u1', username: 'alice', avatar_url: null };
const fakeVote = { comment_id: 'c1', vote_type: 'upvote' };

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, retryDelay: 0 } },
  });
  jest.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

describe('usePostComments', () => {
  it('returns empty arrays and is disabled when postId is null', () => {
    const { result } = renderHook(() => usePostComments(null, null, []), {
      wrapper: createWrapper(),
    });
    expect(result.current.flatComments).toEqual([]);
    expect(result.current.treeComments).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty arrays when postId is empty string', () => {
    const { result } = renderHook(() => usePostComments('', null, []), {
      wrapper: createWrapper(),
    });
    expect(result.current.flatComments).toEqual([]);
  });

  it('fetches comments with correct score calculation (upvotes - downvotes)', async () => {
    // 1st call: comments, 2nd call: profiles, 3rd call: votes
    mockFrom
      .mockReturnValueOnce(buildListChain([fakeComment]))
      .mockReturnValueOnce(buildListChain([fakeProfile]))
      .mockReturnValueOnce(buildListChain([fakeVote]));

    const { result } = renderHook(() => usePostComments('p1', 'u1', []), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flatComments[0].score).toBe(1);
    expect(result.current.flatComments[0].user).toEqual(fakeProfile);
  });

  it('builds treeComments from flat comments', async () => {
    mockFrom
      .mockReturnValueOnce(buildListChain([fakeComment]))
      .mockReturnValueOnce(buildListChain([fakeProfile]))
      .mockReturnValueOnce(buildListChain([]));

    const { result } = renderHook(() => usePostComments('p1', 'u1', []), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.treeComments).toHaveLength(1);
    expect(result.current.treeComments[0].id).toBe('c1');
  });

  it('still returns comments when profiles fetch returns empty (unknown author)', async () => {
    mockFrom
      .mockReturnValueOnce(buildListChain([fakeComment]))
      .mockReturnValueOnce(buildListChain([])) // profiles empty
      .mockReturnValueOnce(buildListChain([]));

    const { result } = renderHook(() => usePostComments('p1', 'u1', []), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flatComments).toHaveLength(1);
    expect(result.current.flatComments[0].user).toBeUndefined();
  });

  it('filters out blocked users from treeComments', async () => {
    const blockedComment = { ...fakeComment, id: 'c2', user_id: 'blocked-user' };
    mockFrom
      .mockReturnValueOnce(buildListChain([fakeComment, blockedComment]))
      .mockReturnValueOnce(buildListChain([fakeProfile]))
      .mockReturnValueOnce(buildListChain([]));

    const { result } = renderHook(() => usePostComments('p1', 'u1', ['blocked-user']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // treeComments built with blockedUserIds — blocked user not in tree
    const treeIds = result.current.treeComments.map((n) => n.user_id);
    expect(treeIds).not.toContain('blocked-user');
  });

  it('isError is true when comments fetch fails', async () => {
    mockFrom.mockReturnValueOnce(buildListChain([], new Error('db error')));

    const { result } = renderHook(() => usePostComments('p1', 'u1', []), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});
