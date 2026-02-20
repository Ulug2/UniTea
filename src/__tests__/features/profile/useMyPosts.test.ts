/**
 * Tests for src/features/profile/hooks/useMyPosts.ts
 *
 * Mocked: supabase, AuthContext, useBlocks
 */

jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../hooks/useBlocks');

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyPosts, type ProfileTab } from '../../../features/profile/hooks/useMyPosts';
import { useBlocks } from '../../../hooks/useBlocks';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

const mockedUseBlocks = useBlocks as jest.MockedFunction<typeof useBlocks>;
const mockFrom = supabase.from as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

// ── supabase chain builder ────────────────────────────────────────────────────
function makeSupabaseChain(rows: unknown[], error: unknown = null) {
  const chain: Record<string, any> = {};
  ['select', 'eq', 'order', 'range', 'not', 'or', 'in'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  // terminal resolution
  Object.defineProperty(chain, 'then', {
    get: () =>
      Promise.resolve({ data: rows, error }).then.bind(
        Promise.resolve({ data: rows, error })
      ),
    configurable: true,
  });
  return chain;
}

function makeBookmarkChain(bookmarks: unknown[]) {
  return makeSupabaseChain(bookmarks);
}

// ── wrapper ───────────────────────────────────────────────────────────────────
let qc: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ── post factory ──────────────────────────────────────────────────────────────
let _idCounter = 0;
function makePost(overrides: Record<string, unknown> = {}) {
  _idCounter++;
  return {
    post_id: `post-${_idCounter}`,
    user_id: 'user-owner',
    content: `Content ${_idCounter}`,
    created_at: new Date().toISOString(),
    is_anonymous: false,
    vote_score: 0,
    comment_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  _idCounter = 0;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.clearAllMocks();

  mockUseAuth.mockReturnValue({
    session: { user: { id: 'user-1', email: 'user@uni.edu' } },
    loading: false,
    error: null,
    signOut: jest.fn(),
  });

  // Default: no blocks
  mockedUseBlocks.mockReturnValue({
    data: [],
    isSuccess: true,
    isLoading: false,
  } as any);
});

afterEach(() => {
  qc.clear();
});

// ── helpers ───────────────────────────────────────────────────────────────────
function mockSupabaseForTab(
  tab: ProfileTab,
  posts: unknown[],
  bookmarks: unknown[] = []
) {
  if (tab === 'bookmarked') {
    // 1st call → bookmarks table, 2nd → posts_summary_view
    mockFrom
      .mockReturnValueOnce(makeBookmarkChain(bookmarks))
      .mockReturnValueOnce(makeSupabaseChain(posts)) // posts_summary_view
      .mockReturnValue(makeSupabaseChain([]));        // votes + comments (empty)
  } else {
    // 1st call → posts_summary_view (user-posts), then bookmarks, votes, comments
    mockFrom
      .mockReturnValueOnce(makeSupabaseChain(posts))  // user-posts
      .mockReturnValueOnce(makeSupabaseChain([]))     // bookmarks
      .mockReturnValue(makeSupabaseChain([]));        // votes + comments
  }
}

// ============================================================
// filteredPosts
// ============================================================
describe('useMyPosts — filteredPosts', () => {
  it('returns all user posts for "all" tab', async () => {
    const posts = [makePost(), makePost(), makePost()];
    mockSupabaseForTab('all', posts);

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.filteredPosts.length).toBeGreaterThan(0));
    expect(result.current.filteredPosts).toHaveLength(3);
  });

  it('returns only anonymous posts for "anonymous" tab', async () => {
    const posts = [
      makePost({ is_anonymous: true }),
      makePost({ is_anonymous: false }),
      makePost({ is_anonymous: true }),
    ];
    mockSupabaseForTab('anonymous', posts);

    const { result } = renderHook(
      () => useMyPosts('user-1', 'anonymous'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.filteredPosts.length).toBeGreaterThan(0));
    expect(result.current.filteredPosts).toHaveLength(2);
    result.current.filteredPosts.forEach((p) => {
      expect((p as any).is_anonymous).toBe(true);
    });
  });

  it('deduplicates posts with the same post_id', async () => {
    const post = makePost({ post_id: 'dupe-post' });
    // Simulate the same post appearing twice (e.g. data bug)
    const posts = [post, { ...post }];
    mockSupabaseForTab('all', posts);

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.userPosts.length).toBeGreaterThan(0));
    const dupeIds = result.current.filteredPosts.filter((p: any) => p.post_id === 'dupe-post');
    expect(dupeIds).toHaveLength(1);
  });

  it('filters blocked users from bookmarked tab', async () => {
    const blockedPost = makePost({ user_id: 'blocked-user', post_id: 'bad-post' });
    const goodPost = makePost({ user_id: 'good-user', post_id: 'good-post' });
    const bookmarks = [
      { post_id: 'bad-post', created_at: new Date().toISOString() },
      { post_id: 'good-post', created_at: new Date().toISOString() },
    ];

    mockedUseBlocks.mockReturnValue({ data: ['blocked-user'], isSuccess: true } as any);

    mockFrom
      .mockReturnValueOnce(makeSupabaseChain([]))               // user-posts (not bookmarked tab)
      .mockReturnValueOnce(makeBookmarkChain(bookmarks))        // bookmarks
      .mockReturnValueOnce(makeSupabaseChain([blockedPost, goodPost])) // posts_summary_view
      .mockReturnValue(makeSupabaseChain([]));                  // votes + comments

    const { result } = renderHook(
      () => useMyPosts('user-1', 'bookmarked'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.bookmarkedPosts.length).toBeGreaterThan(0));
    const filtered = result.current.filteredPosts;
    expect(filtered.find((p: any) => p.user_id === 'blocked-user')).toBeUndefined();
    expect(filtered.find((p: any) => p.user_id === 'good-user')).toBeTruthy();
  });

  it('does NOT filter blocked users from own posts in "all" tab', async () => {
    // Even if a blocked user ID matches, own posts are never filtered
    const ownPost = makePost({ user_id: 'user-1', post_id: 'my-post' });
    mockedUseBlocks.mockReturnValue({ data: ['user-1'], isSuccess: true } as any);
    mockSupabaseForTab('all', [ownPost]);

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.filteredPosts.length).toBeGreaterThan(0));
    expect(result.current.filteredPosts).toHaveLength(1);
  });

  it('returns empty filteredPosts when userId is undefined', async () => {
    const { result } = renderHook(
      () => useMyPosts(undefined, 'all'),
      { wrapper: createWrapper() }
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.filteredPosts).toHaveLength(0);
  });
});

// ============================================================
// postScoresMap
// ============================================================
describe('useMyPosts — postScoresMap', () => {
  it('calculates correct score: 2 upvotes, 1 downvote → 1', async () => {
    const post = makePost({ post_id: 'scored-post' });
    const votes = [
      { post_id: 'scored-post', vote_type: 'upvote' },
      { post_id: 'scored-post', vote_type: 'upvote' },
      { post_id: 'scored-post', vote_type: 'downvote' },
    ];

    mockFrom
      .mockReturnValueOnce(makeSupabaseChain([post]))   // user-posts
      .mockReturnValueOnce(makeSupabaseChain([]))       // bookmarks
      .mockReturnValueOnce(makeSupabaseChain(votes))    // votes
      .mockReturnValue(makeSupabaseChain([]));          // comments

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.postScoresMap.size).toBeGreaterThan(0));
    expect(result.current.postScoresMap.get('scored-post')).toBe(1);
  });

  it('falls back to post.vote_score when no votes fetched (non-bookmarked tab)', async () => {
    const post = makePost({ post_id: 'fallback-post', vote_score: 42 });

    mockFrom
      .mockReturnValueOnce(makeSupabaseChain([post])) // user-posts
      .mockReturnValueOnce(makeSupabaseChain([]))     // bookmarks
      .mockReturnValueOnce(makeSupabaseChain([]))     // votes (empty!)
      .mockReturnValue(makeSupabaseChain([]));        // comments

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.postScoresMap.size).toBeGreaterThan(0));
    expect(result.current.postScoresMap.get('fallback-post')).toBe(42);
  });
});

// ============================================================
// commentCountsMap
// ============================================================
describe('useMyPosts — commentCountsMap', () => {
  it('counts comments per post correctly', async () => {
    const post = makePost({ post_id: 'commented-post' });
    const comments = [
      { post_id: 'commented-post' },
      { post_id: 'commented-post' },
      { post_id: 'commented-post' },
    ];

    mockFrom
      .mockReturnValueOnce(makeSupabaseChain([post]))      // user-posts
      .mockReturnValueOnce(makeSupabaseChain([]))          // bookmarks
      .mockReturnValueOnce(makeSupabaseChain([]))          // votes
      .mockReturnValueOnce(makeSupabaseChain(comments));   // comments

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.commentCountsMap.size).toBeGreaterThan(0));
    expect(result.current.commentCountsMap.get('commented-post')).toBe(3);
  });

  it('falls back to post.comment_count when no comments fetched (non-bookmarked)', async () => {
    const post = makePost({ post_id: 'comment-fallback', comment_count: 7 });

    mockFrom
      .mockReturnValueOnce(makeSupabaseChain([post])) // user-posts
      .mockReturnValueOnce(makeSupabaseChain([]))     // bookmarks
      .mockReturnValueOnce(makeSupabaseChain([]))     // votes
      .mockReturnValueOnce(makeSupabaseChain([]));    // comments (empty)

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.commentCountsMap.size).toBeGreaterThan(0));
    expect(result.current.commentCountsMap.get('comment-fallback')).toBe(7);
  });
});

// ============================================================
// totalVotes
// ============================================================
describe('useMyPosts — totalVotes', () => {
  it('sums all post scores into totalVotes', async () => {
    const posts = [
      makePost({ post_id: 'p1', vote_score: 5 }),
      makePost({ post_id: 'p2', vote_score: 3 }),
    ];

    mockFrom
      .mockReturnValueOnce(makeSupabaseChain(posts))
      .mockReturnValueOnce(makeSupabaseChain([]))
      .mockReturnValueOnce(makeSupabaseChain([]))
      .mockReturnValue(makeSupabaseChain([]));

    const { result } = renderHook(
      () => useMyPosts('user-1', 'all'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.totalVotes).not.toBe(0));
    expect(result.current.totalVotes).toBe(8); // 5 + 3
  });
});
