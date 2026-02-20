/**
 * Tests for src/utils/votes.ts
 *
 * Strategy: mock supabase with an inline factory (avoids circular require).
 */

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../../lib/supabase';
import {
  getPostScore,
  getCommentScore,
  getUserVote,
  vote,
  setVote,
} from '../../utils/votes';

// ---------- helpers ----------

/** Build a reusable chainable supabase query mock with a fixed terminal response. */
function buildChain(terminalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'eq', 'not', 'order', 'range', 'in', 'or', 'delete', 'update', 'upsert'];
  methods.forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain['maybeSingle'] = jest.fn().mockResolvedValue(terminalResult);
  // Make the chain itself awaitable to cover queries that don't use .maybeSingle()
  (chain as any)[Symbol.for('nodejs.rejection')] = undefined;
  Object.defineProperty(chain, 'then', {
    get: () => Promise.resolve(terminalResult).then.bind(Promise.resolve(terminalResult)),
    configurable: true,
  });
  return chain;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// getPostScore
// ============================================================
describe('getPostScore', () => {
  it('returns the correct score for a mix of upvotes and downvotes', async () => {
    mockFrom.mockReturnValue(buildChain({
      data: [{ vote_type: 'upvote' }, { vote_type: 'upvote' }, { vote_type: 'downvote' }],
      error: null,
    }));
    expect(await getPostScore('post-1')).toBe(1);
  });

  it('returns 0 when there are no votes', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }));
    expect(await getPostScore('post-no-votes')).toBe(0);
  });

  it('returns 0 (does not throw) when supabase returns an error', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'DB error', code: '500' } }));
    expect(await getPostScore('post-err')).toBe(0);
  });

  it('handles all upvotes correctly', async () => {
    mockFrom.mockReturnValue(buildChain({
      data: [{ vote_type: 'upvote' }, { vote_type: 'upvote' }, { vote_type: 'upvote' }],
      error: null,
    }));
    expect(await getPostScore('post-all-up')).toBe(3);
  });

  it('handles all downvotes correctly', async () => {
    mockFrom.mockReturnValue(buildChain({
      data: [{ vote_type: 'downvote' }, { vote_type: 'downvote' }],
      error: null,
    }));
    expect(await getPostScore('post-all-down')).toBe(-2);
  });
});

// ============================================================
// getCommentScore
// ============================================================
describe('getCommentScore', () => {
  it('returns 0 immediately for temp- comment IDs (no DB call)', async () => {
    const score = await getCommentScore('temp-123');
    expect(score).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns the correct score for a real comment', async () => {
    mockFrom.mockReturnValue(buildChain({
      data: [{ vote_type: 'upvote' }, { vote_type: 'downvote' }, { vote_type: 'downvote' }],
      error: null,
    }));
    expect(await getCommentScore('comment-abc')).toBe(-1);
  });

  it('returns 0 on error without throwing', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'fail', code: '500' } }));
    expect(await getCommentScore('comment-err')).toBe(0);
  });
});

// ============================================================
// getUserVote
// ============================================================
describe('getUserVote', () => {
  it('returns null when no target id provided', async () => {
    const result = await getUserVote('user-1');
    expect(result).toEqual({ voteType: null, voteId: null });
  });

  it('returns null for temp- post IDs without querying DB', async () => {
    expect(await getUserVote('user-1', 'temp-post-123')).toEqual({ voteType: null, voteId: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null for temp- comment IDs without querying DB', async () => {
    expect(await getUserVote('user-1', undefined, 'temp-comment-456')).toEqual({ voteType: null, voteId: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns the existing upvote when user has voted', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { vote_type: 'upvote', id: 'vote-id-1' }, error: null }));
    expect(await getUserVote('user-1', 'post-1')).toEqual({ voteType: 'upvote', voteId: 'vote-id-1' });
  });

  it('returns null when user has not voted (PGRST116 ignored)', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { code: 'PGRST116' } }));
    expect(await getUserVote('user-1', 'post-1')).toEqual({ voteType: null, voteId: null });
  });

  it('returns null on generic DB error without throwing', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { code: '500', message: 'server error' } }));
    expect(await getUserVote('user-1', 'post-1')).toEqual({ voteType: null, voteId: null });
  });
});

// ============================================================
// vote
// ============================================================
describe('vote', () => {
  it('throws if neither postId nor commentId is provided', async () => {
    await expect(vote('user-1', 'upvote')).rejects.toThrow(
      'Either postId or commentId must be provided'
    );
  });

  it('inserts a new vote when user has not voted before', async () => {
    const getUserVoteChain = buildChain({ data: null, error: { code: 'PGRST116' } });
    const upsertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const insertChain = { ...getUserVoteChain, upsert: upsertMock };
    mockFrom.mockReturnValueOnce(getUserVoteChain).mockReturnValue(insertChain);

    await vote('user-1', 'upvote', 'post-1');

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ vote_type: 'upvote', user_id: 'user-1', post_id: 'post-1' }),
      expect.objectContaining({ onConflict: 'user_id,post_id' })
    );
  });

  it('removes the vote when user clicks the same vote type again (toggle off)', async () => {
    const getUserVoteChain = buildChain({ data: { vote_type: 'upvote', id: 'vote-id-1' }, error: null });
    const deleteMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) });
    const deleteChain = { ...getUserVoteChain, delete: deleteMock };
    mockFrom.mockReturnValueOnce(getUserVoteChain).mockReturnValue(deleteChain);

    await vote('user-1', 'upvote', 'post-1');

    expect(deleteMock).toHaveBeenCalled();
  });

  it('updates the vote when user switches from upvote to downvote', async () => {
    const getUserVoteChain = buildChain({ data: { vote_type: 'upvote', id: 'vote-id-1' }, error: null });
    const updateMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) });
    const updateChain = { ...getUserVoteChain, update: updateMock };
    mockFrom.mockReturnValueOnce(getUserVoteChain).mockReturnValue(updateChain);

    await vote('user-1', 'downvote', 'post-1');

    expect(updateMock).toHaveBeenCalledWith({ vote_type: 'downvote' });
  });
});

// ============================================================
// setVote
// ============================================================
describe('setVote', () => {
  it('throws if neither postId nor commentId is provided', async () => {
    await expect(setVote('user-1', 'upvote')).rejects.toThrow(
      'Either postId or commentId must be provided'
    );
  });

  it('is a no-op when removing a vote that does not exist', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { code: 'PGRST116' } }));
    await setVote('user-1', null, 'post-1');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when setting same vote type that already exists', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { vote_type: 'upvote', id: 'vote-id-1' }, error: null }));
    await setVote('user-1', 'upvote', 'post-1');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('deletes an existing vote when desiredVoteType is null', async () => {
    const getUserVoteChain = buildChain({ data: { vote_type: 'upvote', id: 'vote-id-99' }, error: null });
    const deleteMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) });
    mockFrom.mockReturnValueOnce(getUserVoteChain).mockReturnValue({ delete: deleteMock });
    await setVote('user-1', null, 'post-1');
    expect(deleteMock).toHaveBeenCalled();
  });
});
