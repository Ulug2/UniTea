/**
 * Tests for src/hooks/useBlocks.ts
 */

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useBlocks,
  isBlockedChat,
  isBlockedPost,
  fetchBlockRecords,
  type BlockRecord,
} from '../../hooks/useBlocks';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// ── test wrapper ─────────────────────────────────────────────────────────────
let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ── supabase chain builder ────────────────────────────────────────────────────
function buildSelectChain(rows: Array<Record<string, string>>) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (resolve: any, reject?: any) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    catch: (reject: any) =>
      Promise.resolve({ data: rows, error: null }).catch(reject),
  };
  return chain;
}

const mockFrom = supabase.from as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    session: { user: { id: 'current-user', email: 'me@uni.edu' } },
    loading: false,
    error: null,
    signOut: jest.fn(),
  });
});

afterEach(() => {
  queryClient.clear();
});

describe('useBlocks', () => {
  it('returns empty array when current user has no blocks', async () => {
    mockFrom.mockReturnValue(buildSelectChain([]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns BlockRecords for users blocked by the current user', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([
        { blocked_id: 'user-A', block_scope: 'profile_only' },
        { blocked_id: 'user-B', block_scope: 'anonymous_only' },
      ]))
      .mockReturnValueOnce(buildSelectChain([]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.some((r) => r.userId === 'user-A' && r.scope === 'profile_only')).toBe(true);
    expect(data.some((r) => r.userId === 'user-B' && r.scope === 'anonymous_only')).toBe(true);
  });

  it('returns profile_only BlockRecord for users who blocked the current user with profile_only', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([]))
      .mockReturnValueOnce(buildSelectChain([{ blocker_id: 'user-C', block_scope: 'profile_only' }]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.some((r) => r.userId === 'user-C' && r.scope === 'profile_only')).toBe(true);
  });

  it('preserves anonymous_only scope for users who blocked the current user anonymously (does not coerce to profile_only)', async () => {
    // Regression test: coercing a reverse anonymous_only block to profile_only
    // would make isBlockedPost/isBlockedChat incorrectly hide that person's
    // unrelated public content, recreating the anonymous-chat deanonymization bug.
    mockFrom
      .mockReturnValueOnce(buildSelectChain([]))
      .mockReturnValueOnce(buildSelectChain([{ blocker_id: 'user-D', block_scope: 'anonymous_only' }]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.some((r) => r.userId === 'user-D' && r.scope === 'anonymous_only')).toBe(true);
    expect(data.some((r) => r.userId === 'user-D' && r.scope === 'profile_only')).toBe(false);
  });

  it('merges both directions without duplicates', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([
        { blocked_id: 'user-X', block_scope: 'profile_only' },
        { blocked_id: 'user-Y', block_scope: 'profile_only' },
      ]))
      .mockReturnValueOnce(buildSelectChain([
        { blocker_id: 'user-X', block_scope: 'profile_only' },
        { blocker_id: 'user-Z', block_scope: 'profile_only' },
      ]));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.filter((r) => r.userId === 'user-X')).toHaveLength(1);
    expect(data.some((r) => r.userId === 'user-Y')).toBe(true);
    expect(data.some((r) => r.userId === 'user-Z')).toBe(true);
    expect(data).toHaveLength(3);
  });

  it('is disabled when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false, error: null, signOut: jest.fn() });
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isSuccess).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('still resolves when one sub-query returns an error', async () => {
    const errorChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: any) =>
        Promise.resolve({ data: null, error: { message: 'DB error' } }).then(resolve),
      catch: () => {},
    };
    mockFrom
      .mockReturnValueOnce(buildSelectChain([{ blocked_id: 'user-A', block_scope: 'profile_only' }]))
      .mockReturnValueOnce(errorChain);
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data ?? [];
    expect(data.some((r) => r.userId === 'user-A')).toBe(true);
  });
});

describe('fetchBlockRecords (Phase 7.2: shared by useBlocks() and _layout.tsx\'s cold-start prefetch)', () => {
  // Regression test for the blocks-cache-shape bug: _layout.tsx used to
  // reimplement this fetch independently and write a flat string[] under
  // the same ["blocks", userId] key useBlocks() reads — every isBlockedX()
  // check silently evaluated to false whenever that write won the race.
  // _layout.tsx now calls this exact function instead, so asserting its
  // return shape here is what protects against that regression recurring.
  it('returns BlockRecord[] ({userId, scope}[]), never a flat id array', async () => {
    mockFrom
      .mockReturnValueOnce(buildSelectChain([{ blocked_id: 'user-A', block_scope: 'profile_only' }]))
      .mockReturnValueOnce(buildSelectChain([{ blocker_id: 'user-B', block_scope: 'anonymous_only' }]));

    const records = await fetchBlockRecords('current-user');

    expect(records).toEqual(
      expect.arrayContaining([
        { userId: 'user-A', scope: 'profile_only' },
        { userId: 'user-B', scope: 'anonymous_only' },
      ]),
    );
    // Every entry must be a {userId, scope} object, not a bare string —
    // this is exactly the shape mismatch the original bug had.
    records.forEach((r) => {
      expect(typeof r).toBe('object');
      expect(r).toHaveProperty('userId');
      expect(r).toHaveProperty('scope');
    });
  });

  it('produces output identical in shape to what useBlocks() itself resolves, for the same data', async () => {
    const byMe = [{ blocked_id: 'user-A', block_scope: 'profile_only' }];
    const byOthers = [{ blocker_id: 'user-B', block_scope: 'anonymous_only' }];

    mockFrom.mockReturnValueOnce(buildSelectChain(byMe)).mockReturnValueOnce(buildSelectChain(byOthers));
    const direct = await fetchBlockRecords('current-user');

    mockFrom.mockReturnValueOnce(buildSelectChain(byMe)).mockReturnValueOnce(buildSelectChain(byOthers));
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sortByUser = (arr: BlockRecord[]) => [...arr].sort((a, b) => a.userId.localeCompare(b.userId));
    expect(sortByUser(direct)).toEqual(sortByUser(result.current.data ?? []));
  });

  it('returns an empty array when userId is missing, same as useBlocks() being disabled', async () => {
    const records = await fetchBlockRecords(undefined);
    expect(records).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('isBlockedChat', () => {
  it('hides an anonymous chat only for an anonymous_only block on that user', () => {
    const blocks: BlockRecord[] = [{ userId: 'partner', scope: 'anonymous_only' }];
    expect(isBlockedChat(blocks, 'partner', true)).toBe(true);
    expect(isBlockedChat(blocks, 'partner', false)).toBe(false);
  });

  it('hides a non-anonymous chat only for a profile_only block on that user', () => {
    const blocks: BlockRecord[] = [{ userId: 'partner', scope: 'profile_only' }];
    expect(isBlockedChat(blocks, 'partner', false)).toBe(true);
    expect(isBlockedChat(blocks, 'partner', true)).toBe(false);
  });

  it('returns false with no otherUserId', () => {
    expect(isBlockedChat([], null, true)).toBe(false);
    expect(isBlockedChat([], undefined, false)).toBe(false);
  });
});

describe('P0 regression: blocking an anonymous chat partner must not deanonymize them via the feed', () => {
  // Reproduces the exact scenario from the bug report: user A has an
  // anonymous chat with user B, who also has an unrelated public
  // (non-anonymous) post. Blocking B from within that anonymous chat must:
  //   (1) hide the anonymous chat/conversation from A (blocking still works)
  //   (2) NOT hide B's unrelated public post from A's feed (the leak)
  //
  // block_chat_partner (server-side RPC) now always stores block_scope =
  // 'anonymous_only' for this action (see the migration and chat/[id].tsx's
  // blockUserMutation). These two client-side helpers are what decide
  // chat-visibility (isBlockedChat) and post-visibility (isBlockedPost) from
  // that same blocks list, so asserting both against a single anonymous_only
  // record is the client-side equivalent of the server-side proof already
  // run against a real Postgres instance for this fix.
  it('an anonymous_only block hides the chat but leaves the blocked user\'s public posts visible', () => {
    const blocksAfterAnonymousChatBlock: BlockRecord[] = [
      { userId: 'user-B', scope: 'anonymous_only' },
    ];

    expect(isBlockedChat(blocksAfterAnonymousChatBlock, 'user-B', true)).toBe(true);
    expect(
      isBlockedPost(blocksAfterAnonymousChatBlock, 'user-B', /* isAnonymous */ false),
    ).toBe(false);
  });

  it('a profile_only block (normal, non-chat blocking) still hides public posts as before', () => {
    const blocksFromNormalBlockUi: BlockRecord[] = [
      { userId: 'user-B', scope: 'profile_only' },
    ];

    expect(
      isBlockedPost(blocksFromNormalBlockUi, 'user-B', /* isAnonymous */ false),
    ).toBe(true);
    // And it does not affect an unrelated anonymous chat with the same user.
    expect(isBlockedChat(blocksFromNormalBlockUi, 'user-B', true)).toBe(false);
  });
});
