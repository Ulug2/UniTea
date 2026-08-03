import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import {
  saveLostFoundToStorage,
  seedLostFoundCacheFromStorage,
  saveCampusFeedToStorage,
  seedCampusFeedCacheFromStorage,
  saveCommunityFeedToStorage,
  seedCommunityFeedCacheFromStorage,
  savePollToStorage,
  seedPollCachesForPosts,
} from '../../utils/feedPersistence';

const UNI_A = 'uni-a';
const UNI_B = 'uni-b';

function makePosts(label: string) {
  return [{ post_id: `${label}-1`, content: label }] as any[];
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('Lost & Found persistence — university-scoped keys', () => {
  it('writes under a key that includes universityId', async () => {
    await saveLostFoundToStorage(UNI_A, [makePosts('a')]);

    const raw = await AsyncStorage.getItem('@unitee:lostfound_v1:' + UNI_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(makePosts('a'));
  });

  it('is a no-op (does not write anything) when universityId is missing', async () => {
    await saveLostFoundToStorage(undefined, [makePosts('a')]);
    await saveLostFoundToStorage(null, [makePosts('a')]);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith('@unitee:lostfound_v1'))).toHaveLength(0);
  });

  it('two different universities are stored under two different keys and cannot collide', async () => {
    await saveLostFoundToStorage(UNI_A, [makePosts('a')]);
    await saveLostFoundToStorage(UNI_B, [makePosts('b')]);

    const rawA = await AsyncStorage.getItem('@unitee:lostfound_v1:' + UNI_A);
    const rawB = await AsyncStorage.getItem('@unitee:lostfound_v1:' + UNI_B);
    expect(JSON.parse(rawA as string)).toEqual(makePosts('a'));
    expect(JSON.parse(rawB as string)).toEqual(makePosts('b'));
  });

  it('seeds the exact live query key ["posts","lost_found",universityId]', async () => {
    await saveLostFoundToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedLostFoundCacheFromStorage(queryClient, UNI_A);

    const seeded = queryClient.getQueryData(['posts', 'lost_found', UNI_A]);
    expect(seeded).toEqual({ pages: [makePosts('a')], pageParams: [0] });
  });

  it('does not seed anything when universityId is not yet known', async () => {
    await saveLostFoundToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedLostFoundCacheFromStorage(queryClient, undefined);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('never seeds another university\'s data under this university\'s key (no cross-university hydration)', async () => {
    await saveLostFoundToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedLostFoundCacheFromStorage(queryClient, UNI_B);

    // University B has no stored blob of its own, so nothing should seed —
    // University A's data must never leak into University B's query key.
    expect(queryClient.getQueryData(['posts', 'lost_found', UNI_B])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not overwrite data already present in the cache for that key', async () => {
    await saveLostFoundToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    const fresh = { pages: [makePosts('fresh')], pageParams: [0] };
    queryClient.setQueryData(['posts', 'lost_found', UNI_A], fresh);

    await seedLostFoundCacheFromStorage(queryClient, UNI_A);

    expect(queryClient.getQueryData(['posts', 'lost_found', UNI_A])).toEqual(fresh);
  });
});

describe('Campus Feed ("hot" tab) persistence — cold start (Phase 7.1)', () => {
  it('writes under a key that includes universityId', async () => {
    await saveCampusFeedToStorage(UNI_A, [makePosts('a')]);

    const raw = await AsyncStorage.getItem('@unitee:campus_feed_hot_v1:' + UNI_A);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(makePosts('a'));
  });

  it('is a no-op (does not write anything) when universityId is missing', async () => {
    await saveCampusFeedToStorage(undefined, [makePosts('a')]);
    await saveCampusFeedToStorage(null, [makePosts('a')]);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith('@unitee:campus_feed_hot_v1'))).toHaveLength(0);
  });

  it('two different universities are stored under two different keys and cannot collide', async () => {
    await saveCampusFeedToStorage(UNI_A, [makePosts('a')]);
    await saveCampusFeedToStorage(UNI_B, [makePosts('b')]);

    const rawA = await AsyncStorage.getItem('@unitee:campus_feed_hot_v1:' + UNI_A);
    const rawB = await AsyncStorage.getItem('@unitee:campus_feed_hot_v1:' + UNI_B);
    expect(JSON.parse(rawA as string)).toEqual(makePosts('a'));
    expect(JSON.parse(rawB as string)).toEqual(makePosts('b'));
  });

  it('seeds the exact live query key ["posts","feed","hot","",universityId,null] used by useFeedPosts', async () => {
    await saveCampusFeedToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedCampusFeedCacheFromStorage(queryClient, UNI_A);

    const seeded = queryClient.getQueryData(['posts', 'feed', 'hot', '', UNI_A, null]);
    expect(seeded).toEqual({ pages: [makePosts('a')], pageParams: [0] });
  });

  it('seeded data is immediately stale (updatedAt: 0), so a background refetch fires on mount', async () => {
    await saveCampusFeedToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedCampusFeedCacheFromStorage(queryClient, UNI_A);

    const state = queryClient
      .getQueryCache()
      .find({ queryKey: ['posts', 'feed', 'hot', '', UNI_A, null] });
    expect(state?.state.dataUpdatedAt).toBe(0);
  });

  it('does not seed anything when universityId is not yet known', async () => {
    await saveCampusFeedToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedCampusFeedCacheFromStorage(queryClient, undefined);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('never seeds another university\'s data under this university\'s key (no cross-university hydration)', async () => {
    await saveCampusFeedToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedCampusFeedCacheFromStorage(queryClient, UNI_B);

    expect(
      queryClient.getQueryData(['posts', 'feed', 'hot', '', UNI_B, null]),
    ).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not overwrite data already present in the cache for that key', async () => {
    await saveCampusFeedToStorage(UNI_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    const fresh = { pages: [makePosts('fresh')], pageParams: [0] };
    queryClient.setQueryData(['posts', 'feed', 'hot', '', UNI_A, null], fresh);

    await seedCampusFeedCacheFromStorage(queryClient, UNI_A);

    expect(
      queryClient.getQueryData(['posts', 'feed', 'hot', '', UNI_A, null]),
    ).toEqual(fresh);
  });

  it('only ever caches the first page, capped, mirroring Lost & Found (bounded storage growth)', async () => {
    const manyPosts = Array.from({ length: 30 }, (_, i) => ({ post_id: `p${i}` })) as any[];
    await saveCampusFeedToStorage(UNI_A, [manyPosts]);

    const raw = await AsyncStorage.getItem('@unitee:campus_feed_hot_v1:' + UNI_A);
    const stored = JSON.parse(raw as string);
    expect(stored.length).toBe(15); // MAX_CACHED
  });

  it('returns the seeded page\'s post ids, so _layout.tsx can seed those posts\' polls too', async () => {
    const posts = [{ post_id: 'a-1', content: 'a' }, { post_id: 'a-2', content: 'a' }] as any[];
    await saveCampusFeedToStorage(UNI_A, [posts]);

    const queryClient = new QueryClient();
    const returnedIds = await seedCampusFeedCacheFromStorage(queryClient, UNI_A);

    expect(returnedIds).toEqual(['a-1', 'a-2']);
  });

  it('returns the already-cached page\'s post ids (not storage\'s) when the query cache already has fresher data', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['posts', 'feed', 'hot', '', UNI_A, null], {
      pages: [[{ post_id: 'fresh-1' }]],
      pageParams: [0],
    });
    await saveCampusFeedToStorage(UNI_A, [makePosts('stale')]);

    const returnedIds = await seedCampusFeedCacheFromStorage(queryClient, UNI_A);

    expect(returnedIds).toEqual(['fresh-1']);
  });

  // Phase 7.2: a repost's poll belongs to reposted_from_post_id, not the
  // repost's own post_id — Poll.tsx renders <Poll postId={repostedFromPostId}/>
  // for reposts. Regression test for the fix: without including it, a
  // repost's poll was never in the seeded id list, so it popped in after
  // the repost itself already rendered.
  it('includes reposted_from_post_id alongside a repost\'s own post_id, for poll seeding', async () => {
    const posts = [
      { post_id: 'repost-1', content: 'check this out', reposted_from_post_id: 'original-1' },
      { post_id: 'plain-1', content: 'no repost' },
    ] as any[];
    await saveCampusFeedToStorage(UNI_A, [posts]);

    const queryClient = new QueryClient();
    const returnedIds = await seedCampusFeedCacheFromStorage(queryClient, UNI_A);

    expect(returnedIds).toEqual(expect.arrayContaining(['repost-1', 'original-1', 'plain-1']));
    expect(returnedIds).toHaveLength(3);
  });

  it('same repost-id inclusion applies to the already-cached branch too', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['posts', 'feed', 'hot', '', UNI_A, null], {
      pages: [[{ post_id: 'repost-2', reposted_from_post_id: 'original-2' }]],
      pageParams: [0],
    });

    const returnedIds = await seedCampusFeedCacheFromStorage(queryClient, UNI_A);

    expect(returnedIds).toEqual(expect.arrayContaining(['repost-2', 'original-2']));
  });

  it('returns an empty array when there is nothing to seed', async () => {
    const queryClient = new QueryClient();
    const returnedIds = await seedCampusFeedCacheFromStorage(queryClient, UNI_A);
    expect(returnedIds).toEqual([]);
  });
});

describe('Poll persistence — cold start (Phase 7.1 follow-up)', () => {
  const POST_A = 'post-a';
  const POST_B = 'post-b';
  const USER = 'user-1';
  const pollBlob = { id: 'poll-1', expires_at: null, allow_multiple: false, poll_options: [], poll_votes: [] };

  it('writes under a key that includes the postId', async () => {
    await savePollToStorage(POST_A, pollBlob);

    const raw = await AsyncStorage.getItem('@unitee:poll_v1:' + POST_A);
    expect(JSON.parse(raw as string)).toEqual(pollBlob);
  });

  it('seeds the exact live query key ["poll", postId, userId] used by Poll.tsx', async () => {
    await savePollToStorage(POST_A, pollBlob);

    const queryClient = new QueryClient();
    await seedPollCachesForPosts(queryClient, [POST_A], USER);

    expect(queryClient.getQueryData(['poll', POST_A, USER])).toEqual(pollBlob);
  });

  it('seeded poll data is immediately stale (updatedAt: 0), so a background refetch fires on mount', async () => {
    await savePollToStorage(POST_A, pollBlob);

    const queryClient = new QueryClient();
    await seedPollCachesForPosts(queryClient, [POST_A], USER);

    const state = queryClient.getQueryCache().find({ queryKey: ['poll', POST_A, USER] });
    expect(state?.state.dataUpdatedAt).toBe(0);
  });

  it('silently skips posts with no stored poll (most posts have none)', async () => {
    await savePollToStorage(POST_A, pollBlob);
    // POST_B never had savePollToStorage called for it.

    const queryClient = new QueryClient();
    await seedPollCachesForPosts(queryClient, [POST_A, POST_B], USER);

    expect(queryClient.getQueryData(['poll', POST_A, USER])).toEqual(pollBlob);
    expect(queryClient.getQueryData(['poll', POST_B, USER])).toBeUndefined();
  });

  it('is a no-op when userId is not yet known', async () => {
    await savePollToStorage(POST_A, pollBlob);

    const queryClient = new QueryClient();
    await seedPollCachesForPosts(queryClient, [POST_A], undefined);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('is a no-op when there are no post ids to check', async () => {
    await savePollToStorage(POST_A, pollBlob);

    const queryClient = new QueryClient();
    await seedPollCachesForPosts(queryClient, [], USER);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not overwrite poll data already present in the cache for that key', async () => {
    await savePollToStorage(POST_A, pollBlob);

    const queryClient = new QueryClient();
    const fresh = { ...pollBlob, id: 'poll-fresh' };
    queryClient.setQueryData(['poll', POST_A, USER], fresh);

    await seedPollCachesForPosts(queryClient, [POST_A], USER);

    expect(queryClient.getQueryData(['poll', POST_A, USER])).toEqual(fresh);
  });
});

describe('Community feed ("hot" tab) persistence — cold start (Phase 7.1 follow-up)', () => {
  const COMMUNITY_A = 'community-a';
  const COMMUNITY_B = 'community-b';

  it('writes under a key that includes universityId, storing the communityId alongside the posts', async () => {
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_A, [makePosts('a')]);

    const raw = await AsyncStorage.getItem('@unitee:community_feed_hot_v1:' + UNI_A);
    expect(JSON.parse(raw as string)).toEqual({ communityId: COMMUNITY_A, posts: makePosts('a') });
  });

  it('is a no-op when universityId or communityId is missing', async () => {
    await saveCommunityFeedToStorage(undefined, COMMUNITY_A, [makePosts('a')]);
    await saveCommunityFeedToStorage(UNI_A, '', [makePosts('a')]);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith('@unitee:community_feed_hot_v1'))).toHaveLength(0);
  });

  it('only ever keeps the most-recently-written community for a university (single bounded key)', async () => {
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_A, [makePosts('a')]);
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_B, [makePosts('b')]);

    const raw = await AsyncStorage.getItem('@unitee:community_feed_hot_v1:' + UNI_A);
    expect(JSON.parse(raw as string).communityId).toBe(COMMUNITY_B);
  });

  it('seeds the exact live query key ["posts","feed","hot","",universityId,communityId] used by useFeedPosts', async () => {
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedCommunityFeedCacheFromStorage(queryClient, UNI_A);

    const seeded = queryClient.getQueryData(['posts', 'feed', 'hot', '', UNI_A, COMMUNITY_A]);
    expect(seeded).toEqual({ pages: [makePosts('a')], pageParams: [0] });
  });

  it('does not seed the Campus Feed key (communityId null) — only the stored community', async () => {
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    await seedCommunityFeedCacheFromStorage(queryClient, UNI_A);

    expect(queryClient.getQueryData(['posts', 'feed', 'hot', '', UNI_A, null])).toBeUndefined();
  });

  it('returns the seeded page\'s post ids for poll seeding', async () => {
    const posts = [{ post_id: 'c-1', content: 'c' }, { post_id: 'c-2', content: 'c' }] as any[];
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_A, [posts]);

    const queryClient = new QueryClient();
    const returnedIds = await seedCommunityFeedCacheFromStorage(queryClient, UNI_A);

    expect(returnedIds).toEqual(['c-1', 'c-2']);
  });

  it('does not seed anything when universityId is not yet known', async () => {
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    const returnedIds = await seedCommunityFeedCacheFromStorage(queryClient, undefined);

    expect(returnedIds).toEqual([]);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not overwrite data already present in the cache for that community\'s key', async () => {
    await saveCommunityFeedToStorage(UNI_A, COMMUNITY_A, [makePosts('a')]);

    const queryClient = new QueryClient();
    const fresh = { pages: [makePosts('fresh')], pageParams: [0] };
    queryClient.setQueryData(['posts', 'feed', 'hot', '', UNI_A, COMMUNITY_A], fresh);

    await seedCommunityFeedCacheFromStorage(queryClient, UNI_A);

    expect(queryClient.getQueryData(['posts', 'feed', 'hot', '', UNI_A, COMMUNITY_A])).toEqual(fresh);
  });
});
