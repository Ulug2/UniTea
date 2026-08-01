import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import * as feedPersistence from '../../utils/feedPersistence';
import {
  saveLostFoundToStorage,
  seedLostFoundCacheFromStorage,
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

describe('Campus Feed persistence — removed', () => {
  it('no longer exports a Campus Feed save/seed path', () => {
    expect((feedPersistence as any).saveFeedToStorage).toBeUndefined();
    expect((feedPersistence as any).seedQueryCacheFromStorage).toBeUndefined();
  });
});
