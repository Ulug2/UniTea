/**
 * Tests for src/features/comments/utils/tree.ts
 *
 * buildCommentTree is a pure function — no mocks needed.
 */

import { buildCommentTree, type CommentVM } from '../../../../features/comments/utils/tree';

// ── Minimal stub factory ──────────────────────────────────────────────────────
function makeComment(overrides: Partial<CommentVM> = {}): CommentVM {
  return {
    id: 'c1',
    post_id: 'post-1',
    user_id: 'user-1',
    content: 'Test comment',
    parent_comment_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
    user: undefined,
    score: 0,
    post_specific_anon_id: null,
    ...overrides,
  } as CommentVM;
}

describe('buildCommentTree', () => {
  // ── happy path ──────────────────────────────────────────────────────────────

  it('returns an empty array for empty input', () => {
    expect(buildCommentTree([])).toEqual([]);
  });

  it('returns a single root comment with no replies', () => {
    const comment = makeComment({ id: 'c1' });
    const tree = buildCommentTree([comment]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('c1');
    expect(tree[0].replies).toHaveLength(0);
  });

  it('nests a reply under its parent', () => {
    const parent = makeComment({ id: 'c1', parent_comment_id: null });
    const reply = makeComment({ id: 'c2', parent_comment_id: 'c1' });

    const tree = buildCommentTree([parent, reply]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('c1');
    expect(tree[0].replies).toHaveLength(1);
    expect(tree[0].replies[0].id).toBe('c2');
  });

  it('nests deeply — grandchild under child under root', () => {
    const root = makeComment({ id: 'root', parent_comment_id: null });
    const child = makeComment({ id: 'child', parent_comment_id: 'root' });
    const grandchild = makeComment({ id: 'grandchild', parent_comment_id: 'child' });

    const tree = buildCommentTree([root, child, grandchild]);

    expect(tree).toHaveLength(1);
    expect(tree[0].replies[0].id).toBe('child');
    expect(tree[0].replies[0].replies[0].id).toBe('grandchild');
    expect(tree[0].replies[0].replies[0].replies).toHaveLength(0);
  });

  it('handles multiple root comments', () => {
    const c1 = makeComment({ id: 'c1', parent_comment_id: null });
    const c2 = makeComment({ id: 'c2', parent_comment_id: null });
    const c3 = makeComment({ id: 'c3', parent_comment_id: null });

    const tree = buildCommentTree([c1, c2, c3]);

    expect(tree).toHaveLength(3);
    expect(tree.map((n) => n.id)).toEqual(['c1', 'c2', 'c3']);
  });

  // ── blocked users ───────────────────────────────────────────────────────────

  it('filters out comments from blocked users', () => {
    const blocked = makeComment({ id: 'b1', user_id: 'bad-user' });
    const normal = makeComment({ id: 'g1', user_id: 'good-user' });

    const tree = buildCommentTree([blocked, normal], ['bad-user']);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('g1');
  });

  it('removes replies from blocked users while keeping the parent', () => {
    const parent = makeComment({ id: 'parent', user_id: 'ok-user', parent_comment_id: null });
    const blockedReply = makeComment({
      id: 'blocked-reply',
      user_id: 'bad-user',
      parent_comment_id: 'parent',
    });
    const okReply = makeComment({
      id: 'ok-reply',
      user_id: 'ok-user',
      parent_comment_id: 'parent',
    });

    const tree = buildCommentTree([parent, blockedReply, okReply], ['bad-user']);

    expect(tree).toHaveLength(1);
    expect(tree[0].replies).toHaveLength(1);
    expect(tree[0].replies[0].id).toBe('ok-reply');
  });

  it('returns empty array when all comments are from blocked users', () => {
    const c1 = makeComment({ id: 'c1', user_id: 'troll' });
    const c2 = makeComment({ id: 'c2', user_id: 'troll' });

    expect(buildCommentTree([c1, c2], ['troll'])).toHaveLength(0);
  });

  it('filters out comments with a null user_id', () => {
    const withNull = makeComment({ id: 'c1', user_id: null as any });
    const normal = makeComment({ id: 'c2', user_id: 'user-1' });

    const tree = buildCommentTree([withNull, normal]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('c2');
  });

  // ── orphaned replies ────────────────────────────────────────────────────────

  it('promotes a reply to root level if its parent is not in the list', () => {
    // Parent is missing from the array (e.g. deleted)
    const orphan = makeComment({ id: 'orphan', parent_comment_id: 'non-existent-parent' });

    const tree = buildCommentTree([orphan]);

    // Orphan gets promoted to root since parent is missing
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('orphan');
  });

  // ── deduplication ───────────────────────────────────────────────────────────

  it('does not duplicate comments that appear multiple times', () => {
    const comment = makeComment({ id: 'c1' });
    // Passing the same object twice (edge case: data bug upstream)
    const tree = buildCommentTree([comment, comment]);

    // Second entry overwrites in commentMap, still only one root
    expect(tree).toHaveLength(1);
  });
});
