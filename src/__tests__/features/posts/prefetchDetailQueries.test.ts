/**
 * Tests for the Phase 2 prefetch-on-tap helpers: they must target the
 * exact same queryKey the destination screen's own useQuery/useInfiniteQuery
 * uses (so React Query dedupes instead of firing a second request), and
 * must no-op when the id they'd need isn't available yet.
 *
 * postDetailQuery.ts predates this phase (Phase 7.8) but had no dedicated
 * test yet; included here since it establishes the exact pattern the new
 * lostFoundDetailQuery.ts / community prefetch helpers mirror.
 */
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { QueryClient } from '@tanstack/react-query';
import {
  postDetailQueryOptions,
  prefetchPostDetail,
} from '../../../features/posts/data/postDetailQuery';
import {
  lostFoundDetailQueryOptions,
  prefetchLostFoundDetail,
} from '../../../features/posts/data/lostFoundDetailQuery';
import {
  universityCommunitiesQueryOptions,
  prefetchUniversityCommunitiesFirstPage,
} from '../../../features/communities/hooks/useUniversityCommunities';
import {
  myCommunitiesQueryOptions,
  prefetchMyCommunities,
} from '../../../features/communities/hooks/useMyCommunities';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

describe('prefetchPostDetail', () => {
  it('prefetches under the exact same queryKey postDetailQueryOptions/the screen itself uses', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
    prefetchPostDetail(queryClient, 'post-1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].queryKey).toEqual(postDetailQueryOptions('post-1').queryKey);
    expect(spy.mock.calls[0][0].queryKey).toEqual(['post', 'post-1']);
  });

  it('is a no-op when postId is missing', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
    prefetchPostDetail(queryClient, undefined);
    prefetchPostDetail(queryClient, null);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('prefetchLostFoundDetail', () => {
  it('prefetches under the exact same queryKey the Lost & Found detail screen uses (["lostfound-detail", postId])', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
    prefetchLostFoundDetail(queryClient, 'lf-post-1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].queryKey).toEqual(
      lostFoundDetailQueryOptions('lf-post-1').queryKey,
    );
    expect(spy.mock.calls[0][0].queryKey).toEqual(['lostfound-detail', 'lf-post-1']);
  });

  it('is a no-op when postId is missing', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
    prefetchLostFoundDetail(queryClient, undefined);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('prefetchUniversityCommunitiesFirstPage', () => {
  it('prefetches an infinite query under the same key useUniversityCommunities uses for no search text', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchInfiniteQuery').mockResolvedValue(undefined);
    prefetchUniversityCommunitiesFirstPage(queryClient, 'uni-1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].queryKey).toEqual(
      universityCommunitiesQueryOptions('uni-1', '').queryKey,
    );
    expect(spy.mock.calls[0][0].queryKey).toEqual(['communities', 'directory', 'uni-1', '']);
    // Only the first page — never the "load hundreds of communities" case.
    expect(spy.mock.calls[0][0].initialPageParam).toBe(0);
  });

  it('is a no-op when universityId is missing', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchInfiniteQuery').mockResolvedValue(undefined);
    prefetchUniversityCommunitiesFirstPage(queryClient, undefined);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('prefetchMyCommunities', () => {
  it('prefetches under the same key useMyCommunities uses', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
    prefetchMyCommunities(queryClient, 'user-1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].queryKey).toEqual(myCommunitiesQueryOptions('user-1').queryKey);
    expect(spy.mock.calls[0][0].queryKey).toEqual(['communities', 'mine', 'user-1']);
  });

  it('is a no-op when userId is missing', () => {
    const queryClient = makeClient();
    const spy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
    prefetchMyCommunities(queryClient, undefined);
    expect(spy).not.toHaveBeenCalled();
  });
});
