/**
 * Tests for src/hooks/useVote.ts
 *
 * Covers optimistic update logic in onMutate. We mock:
 *   - supabase (via moduleNameMapper → __mocks__/supabase.ts)
 *   - AuthContext (via moduleNameMapper → __mocks__/AuthContext.ts)
 *   - utils/votes (to control getUserVote / vote / getPostScore / getCommentScore)
 */

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../utils/votes');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVote } from '../../hooks/useVote';
import { useAuth } from '../../context/AuthContext';
import * as votes from '../../utils/votes';

const mockedGetUserVote = votes.getUserVote as jest.MockedFunction<typeof votes.getUserVote>;
const mockedVote = votes.vote as jest.MockedFunction<typeof votes.vote>;
const mockedGetPostScore = votes.getPostScore as jest.MockedFunction<typeof votes.getPostScore>;
const mockedGetCommentScore = votes.getCommentScore as jest.MockedFunction<typeof votes.getCommentScore>;

// ── wrapper ───────────────────────────────────────────────────────────────────
let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    session: { user: { id: 'test-user-id', email: 'test@uni.edu' } },
    loading: false,
    error: null,
    signOut: jest.fn(),
  });

  // Sensible defaults
  mockedGetUserVote.mockResolvedValue({ voteType: null, voteId: null });
  mockedVote.mockResolvedValue(undefined);
  mockedGetPostScore.mockResolvedValue(5);
  mockedGetCommentScore.mockResolvedValue(2);
});

afterEach(() => {
  queryClient.clear();
});

describe('useVote — initial state', () => {
  it('returns initialUserVote and initialScore when provided (no fetch)', async () => {
    const { result } = renderHook(
      () =>
        useVote({
          postId: 'post-1',
          initialUserVote: 'upvote',
          initialScore: 10,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.userVote).toBe('upvote');
    expect(result.current.score).toBe(10);
    // getUserVote should NOT be called since initialUserVote is provided
    expect(mockedGetUserVote).not.toHaveBeenCalled();
  });

  it('fetches score and userVote when initial values are not provided', async () => {
    mockedGetUserVote.mockResolvedValue({ voteType: 'downvote', voteId: 'v-1' });
    mockedGetPostScore.mockResolvedValue(3);

    const { result } = renderHook(() => useVote({ postId: 'post-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.score).toBe(3), { timeout: 5000 });
    expect(result.current.userVote).toBe('downvote');
  });

  it('returns userVote=null and score=0 when user is not logged in', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: null, loading: false, error: null, signOut: jest.fn() });

    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 0, initialUserVote: null }),
      { wrapper: createWrapper() }
    );

    expect(result.current.userVote).toBeNull();
    expect(result.current.score).toBe(0);
  });
});

describe('useVote — optimistic updates (onMutate)', () => {
  it('optimistically increments score when upvoting from no vote', async () => {
    // Start: score=5, no user vote
    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 5, initialUserVote: null }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleUpvote();
    });

    // Immediately after mutation starts, score should be 6 (optimistic)
    await waitFor(() => expect(result.current.score).toBe(6));
    expect(result.current.userVote).toBe('upvote');
  });

  it('optimistically decrements score when downvoting from no vote', async () => {
    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 5, initialUserVote: null }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleDownvote();
    });

    await waitFor(() => expect(result.current.score).toBe(4));
    expect(result.current.userVote).toBe('downvote');
  });

  it('optimistically removes vote when clicking the same vote type (toggle off)', async () => {
    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 5, initialUserVote: 'upvote' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleUpvote(); // same as existing → toggle off
    });

    await waitFor(() => expect(result.current.score).toBe(4));
    expect(result.current.userVote).toBeNull();
  });

  it('optimistically adjusts score when switching from upvote to downvote', async () => {
    // Previously upvoted (score = 5), now downvoting → score = 5 - 1 - 1 = 3
    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 5, initialUserVote: 'upvote' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleDownvote();
    });

    await waitFor(() => expect(result.current.score).toBe(3));
    expect(result.current.userVote).toBe('downvote');
  });

  it('optimistically adjusts score when switching from downvote to upvote', async () => {
    // Previously downvoted (score = 3), now upvoting → score = 3 + 1 + 1 = 5
    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 3, initialUserVote: 'downvote' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleUpvote();
    });

    await waitFor(() => expect(result.current.score).toBe(5));
    expect(result.current.userVote).toBe('upvote');
  });
});

describe('useVote — error rollback', () => {
  it('rolls back optimistic update when vote() throws', async () => {
    mockedVote.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 5, initialUserVote: null }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleUpvote();
    });

    // Eventually rolls back to original values
    await waitFor(() => expect(result.current.score).toBe(5));
    await waitFor(() => expect(result.current.userVote).toBeNull());
  });
});

describe('useVote — isVoting flag', () => {
  it('isVoting is true while mutation is in flight', async () => {
    // Use a controllable promise so the test can clean up after asserting
    let resolveMutation!: () => void;
    mockedVote.mockReturnValue(new Promise<void>((res) => { resolveMutation = res; }));

    const { result } = renderHook(
      () => useVote({ postId: 'post-1', initialScore: 0, initialUserVote: null }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleUpvote();
    });

    // React Query sets isPending asynchronously; waitFor polls until true
    await waitFor(() => expect(result.current.isVoting).toBe(true));

    // Resolve the mutation so the component cleans up without leaking
    await act(async () => { resolveMutation(); });
    await waitFor(() => expect(result.current.isVoting).toBe(false));
  });
});

describe('useVote — comment voting', () => {
  it('fetches comment score when commentId is provided', async () => {
    mockedGetCommentScore.mockResolvedValue(7);

    const { result } = renderHook(() => useVote({ commentId: 'comment-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.score).toBe(7));
    expect(mockedGetCommentScore).toHaveBeenCalledWith('comment-1');
  });
});
