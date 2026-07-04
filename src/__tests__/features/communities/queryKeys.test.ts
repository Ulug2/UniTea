/**
 * Tests for src/features/communities/data/queryKeys.ts — feedKeys.belongsToCommunity,
 * the predicate that scopes cache invalidation/cancellation to one community
 * (or Campus Feed) at a time. This is a regression guard for a bug where
 * interacting with a post in one community's feed briefly showed its posts
 * inside another feed (including Campus) until a manual refresh, because
 * invalidation used the broad ["posts","feed"] prefix instead of scoping to
 * the affected community.
 */
import { feedKeys } from '../../../features/communities/data/queryKeys';

describe('feedKeys.belongsToCommunity', () => {
  it('matches a Campus Feed (communityId: null) entry for any filter/search/university', () => {
    const predicate = feedKeys.belongsToCommunity(null);
    expect(predicate({ queryKey: ['posts', 'feed', 'hot', '', 'uni-1', null] })).toBe(true);
    expect(predicate({ queryKey: ['posts', 'feed', 'new', 'search text', 'uni-2', null] })).toBe(
      true,
    );
  });

  it('matches a specific community entry for any filter/search/university', () => {
    const predicate = feedKeys.belongsToCommunity('community-a');
    expect(predicate({ queryKey: ['posts', 'feed', 'top', '', 'uni-1', 'community-a'] })).toBe(
      true,
    );
  });

  it('does not match a different community\'s entry', () => {
    const predicate = feedKeys.belongsToCommunity('community-a');
    expect(predicate({ queryKey: ['posts', 'feed', 'top', '', 'uni-1', 'community-b'] })).toBe(
      false,
    );
  });

  it('does not match Campus Feed when scoped to a specific community, or vice versa', () => {
    expect(
      feedKeys.belongsToCommunity('community-a')({
        queryKey: ['posts', 'feed', 'new', '', 'uni-1', null],
      }),
    ).toBe(false);
    expect(
      feedKeys.belongsToCommunity(null)({
        queryKey: ['posts', 'feed', 'new', '', 'uni-1', 'community-a'],
      }),
    ).toBe(false);
  });

  it('does not match unrelated query keys (different feature, or a malformed/short key)', () => {
    const predicate = feedKeys.belongsToCommunity(null);
    expect(predicate({ queryKey: ['posts', 'lost_found'] })).toBe(false);
    expect(predicate({ queryKey: ['bookmarks', 'post-1'] })).toBe(false);
    expect(predicate({ queryKey: ['posts', 'feed'] })).toBe(false);
  });

  it('produces a fresh, independent predicate function per call (no shared state)', () => {
    const a = feedKeys.belongsToCommunity('community-a');
    const b = feedKeys.belongsToCommunity('community-b');
    const key = { queryKey: ['posts', 'feed', 'new', '', 'uni-1', 'community-a'] as const };
    expect(a(key)).toBe(true);
    expect(b(key)).toBe(false);
  });
});
