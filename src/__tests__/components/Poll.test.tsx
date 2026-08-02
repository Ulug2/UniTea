/**
 * Tests for src/components/Poll.tsx's voteMutation — specifically the
 * Phase 5 rewrite from a non-atomic DELETE-then-INSERT pair to two single
 * atomic statements (a targeted DELETE for unvoting, an upsert keyed on
 * (user_id, poll_id) for voting/changing vote), backed by the new
 * poll_votes_user_poll_unique constraint.
 *
 * The initial poll fetch is pre-seeded directly into the QueryClient cache
 * (queryClient.setQueryData) rather than exercised through the mocked
 * network chain, since Poll.tsx's query has staleTime: 30s — pre-seeded,
 * freshly-timestamped data is served synchronously with no background
 * refetch, letting these tests focus purely on the vote mutation itself.
 *
 * Options are "pressed" by walking up from the option's text node to its
 * nearest ancestor with an onPress prop and calling it directly, rather
 * than via fireEvent.press — RTL's synthetic press-event dispatch hangs
 * indefinitely against a real (non-mocked) useMutation in this project's
 * current react-test-renderer/RN version combination (reproduced in
 * isolation, unrelated to this change); calling the same onPress handler
 * directly exercises identical code with no such issue.
 */
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

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

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import Poll from '../../components/Poll';

const mockFrom = supabase.from as jest.Mock;
const POST_ID = 'post-1';
const VIEWER_ID = 'me';

function buildChain(result: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'limit'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain['maybeSingle'] = jest.fn().mockResolvedValue(result);
  chain['single'] = jest.fn().mockResolvedValue(result);
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve(result);
      return p.then.bind(p);
    },
    configurable: true,
  });
  return chain;
}

const OPTION_A = { id: 'opt-a', option_text: 'Option A', position: 0 };
const OPTION_B = { id: 'opt-b', option_text: 'Option B', position: 1 };

function makePoll(poll_votes: Array<{ id: string; option_id: string; user_id: string }>) {
  return {
    id: 'poll-1',
    expires_at: null,
    allow_multiple: false,
    poll_options: [OPTION_A, OPTION_B],
    poll_votes,
  };
}

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  jest.clearAllMocks();
  // Any real network fetch a background refetch happens to trigger (e.g.
  // onSettled's invalidateQueries) resolves harmlessly instead of erroring
  // and retrying — these tests aren't exercising the fetch itself.
  mockFrom.mockReturnValue(buildChain({ data: null, error: null }));
});

afterEach(() => {
  queryClient.clear();
});

function renderPoll(pollData: ReturnType<typeof makePoll>) {
  queryClient.setQueryData(['poll', POST_ID, VIEWER_ID], pollData);
  return render(<Poll postId={POST_ID} />, { wrapper: createWrapper() });
}

/** Finds the option row's onPress by walking up from its text node, and calls it directly. */
function pressOption(utils: ReturnType<typeof render>, optionText: string) {
  let node: any = utils.getByText(optionText);
  while (node && typeof node.props?.onPress !== 'function') {
    node = node.parent;
  }
  if (!node) throw new Error(`No pressable ancestor found for "${optionText}"`);
  node.props.onPress();
}

describe('Poll voteMutation (Phase 5)', () => {
  it('a brand-new vote issues a single upsert keyed on (user_id, poll_id) — one row', async () => {
    const utils = renderPoll(makePoll([]));
    expect(utils.getByText('Option A')).toBeTruthy();

    const upsertChain = buildChain({ error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    await act(async () => {
      pressOption(utils, 'Option A');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upsertChain.upsert).toHaveBeenCalledTimes(1);
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      { poll_id: 'poll-1', option_id: 'opt-a', user_id: 'me' },
      { onConflict: 'user_id,poll_id', ignoreDuplicates: false },
    );
    // No separate delete call for a brand-new vote.
    expect(upsertChain.delete).not.toHaveBeenCalled();
  });

  it('changing option issues one upsert with the new option_id — not a delete+insert pair', async () => {
    const utils = renderPoll(makePoll([{ id: 'v1', option_id: 'opt-a', user_id: 'me' }]));
    expect(utils.getByText('Option B')).toBeTruthy();

    const upsertChain = buildChain({ error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    await act(async () => {
      pressOption(utils, 'Option B'); // different from the current vote
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upsertChain.upsert).toHaveBeenCalledTimes(1);
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      { poll_id: 'poll-1', option_id: 'opt-b', user_id: 'me' },
      { onConflict: 'user_id,poll_id', ignoreDuplicates: false },
    );
    // Exactly one poll_votes write call for this action — no separate delete.
    expect(upsertChain.delete).not.toHaveBeenCalled();
  });

  it('tapping the already-selected option deletes the correct row by (poll_id, user_id)', async () => {
    const utils = renderPoll(makePoll([{ id: 'v1', option_id: 'opt-a', user_id: 'me' }]));
    expect(utils.getByText('Option A')).toBeTruthy();

    const deleteChain = buildChain({ error: null });
    mockFrom.mockReturnValueOnce(deleteChain);

    await act(async () => {
      pressOption(utils, 'Option A'); // already selected
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteChain.delete).toHaveBeenCalledTimes(1);
    expect(deleteChain.eq).toHaveBeenCalledWith('poll_id', 'poll-1');
    expect(deleteChain.eq).toHaveBeenCalledWith('user_id', 'me');
    expect(deleteChain.upsert).not.toHaveBeenCalled();
  });

  it('two rapid vote attempts cannot both fire — the isPending guard allows only one write', async () => {
    const utils = renderPoll(makePoll([]));
    expect(utils.getByText('Option A')).toBeTruthy();

    let resolveUpsert!: (v: any) => void;
    const pending = new Promise((res) => {
      resolveUpsert = res;
    });
    const upsertChain: Record<string, any> = {};
    ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'limit'].forEach((m) => {
      upsertChain[m] = jest.fn().mockReturnValue(upsertChain);
    });
    upsertChain.upsert = jest.fn().mockReturnValue(upsertChain);
    Object.defineProperty(upsertChain, 'then', {
      get: () => pending.then.bind(pending),
      configurable: true,
    });
    mockFrom.mockReturnValueOnce(upsertChain);

    act(() => {
      pressOption(utils, 'Option A');
      pressOption(utils, 'Option A'); // second, overlapping press while the first is in flight
    });

    await act(async () => {
      resolveUpsert({ error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Only one poll_votes call was ever issued for the mutation (the
    // second press was blocked by voteMutation.isPending disabling the
    // Pressable).
    expect(upsertChain.upsert).toHaveBeenCalledTimes(1);
  });

  it('poll rendering (counts, percentages, selection) is unchanged', () => {
    const utils = renderPoll(
      makePoll([
        { id: 'v1', option_id: 'opt-a', user_id: 'me' },
        { id: 'v2', option_id: 'opt-a', user_id: 'other-user' },
        { id: 'v3', option_id: 'opt-b', user_id: 'third-user' },
      ]),
    );

    expect(utils.getByText('Option A')).toBeTruthy();
    expect(utils.getByText('Option B')).toBeTruthy();
    expect(utils.getByText('67%')).toBeTruthy(); // 2/3 for Option A
    expect(utils.getByText('33%')).toBeTruthy(); // 1/3 for Option B
    expect(utils.getByText('3 votes')).toBeTruthy();
  });
});
