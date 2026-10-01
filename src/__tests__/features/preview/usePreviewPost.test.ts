/**
 * usePreviewPost: the live-data access boundary of the web post card
 * preview. Nothing is fetched without a session and a well-formed id, data
 * only flows through the viewer's own (RLS-scoped) client, and the
 * ban/university/block/post-type rules are applied on top of RLS.
 */
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn(), auth: { getSession: jest.fn() } },
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { usePreviewPost } from '../../../features/preview/hooks/usePreviewPost';
import { getPreviewFixture } from '../../../features/preview/data/fixtures';

const mockFrom = supabase.from as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;

const VIEWER = 'viewer-1';
const UNI = '00000000-0000-4000-8000-0000000000b1';
const POST_ID = '00000000-0000-4000-8000-000000000001';
const POST = getPreviewFixture('text')!;

type Result = { data: unknown; error: unknown };

function chainResolving(result: Result) {
  const chain: Record<string, any> = {};
  ['select', 'eq', 'or', 'limit'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.single = jest.fn().mockResolvedValue(result);
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve(result);
      return p.then.bind(p);
    },
  });
  return chain;
}

function mockTables({
  profile = { id: VIEWER, university_id: UNI, is_permanently_banned: false, banned_until: null },
  posts = [POST],
}: { profile?: Record<string, unknown> | null; posts?: unknown[] } = {}) {
  const chains: Record<string, ReturnType<typeof chainResolving>> = {
    profiles: chainResolving({ data: profile, error: null }),
    posts_summary_view: chainResolving({ data: posts, error: null }),
  };
  mockFrom.mockImplementation((table: string) => chains[table]);
  return chains;
}

let queryClient: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => queryClient.clear());

function run(postId: string | null | undefined, viewerId: string | null | undefined) {
  return renderHook(() => usePreviewPost(postId, viewerId), { wrapper });
}

describe('usePreviewPost', () => {
  it('signed out: never queries posts', async () => {
    mockTables();
    const { result } = run(POST_ID, null);
    expect(result.current).toEqual({ status: 'signed-out' });
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockFrom).not.toHaveBeenCalledWith('posts_summary_view');
  });

  it.each([undefined, '', 'abc', "x' or 1=1 --"])(
    'malformed post id %p: invalid, never queries posts',
    async (badId) => {
      mockTables();
      const { result } = run(badId, VIEWER);
      expect(result.current).toEqual({ status: 'invalid' });
      await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('profiles'));
      expect(mockFrom).not.toHaveBeenCalledWith('posts_summary_view');
    },
  );

  it('signed in, same university: reads the post through posts_summary_view only (no writes)', async () => {
    const chains = mockTables();
    const { result } = run(POST_ID, VIEWER);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', post: POST });
    expect(chains.posts_summary_view.eq).toHaveBeenCalledWith('post_id', POST_ID);
    expect(chains.posts_summary_view.or).toHaveBeenCalledWith('is_banned.is.null,is_banned.eq.false');
    expect(mockFrom.mock.calls.map(([t]) => t).sort()).toEqual(['posts_summary_view', 'profiles']);
  });

  it('RLS returns nothing (other university / deleted / missing): unavailable', async () => {
    mockTables({ posts: [] });
    const { result } = run(POST_ID, VIEWER);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('row from another university (defense in depth): unavailable', async () => {
    mockTables({ posts: [{ ...POST, university_id: 'other-university' }] });
    const { result } = run(POST_ID, VIEWER);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('author blocked by the viewer: unavailable', async () => {
    mockTables({ posts: [{ ...POST, is_author_blocked_by_viewer: true }] });
    const { result } = run(POST_ID, VIEWER);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('banned viewer: unavailable even for a visible post', async () => {
    mockTables({
      profile: { id: VIEWER, university_id: UNI, is_permanently_banned: true, banned_until: null },
    });
    const { result } = run(POST_ID, VIEWER);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('query error: error state, not a crash', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'profiles'
        ? chainResolving({ data: { id: VIEWER, university_id: UNI }, error: null })
        : chainResolving({ data: null, error: new Error('network down') }),
    );
    const { result } = run(POST_ID, VIEWER);
    // postDetailQueryOptions retries twice with backoff before erroring.
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 8000 });
  }, 15000);
});
