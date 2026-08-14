/**
 * Tests for the Phase 3.1A UX Refinement 2 cold-start behavior added to
 * src/app/(protected)/(tabs)/index.tsx (FeedScreen):
 *  1. On mount, once useMyCommunities resolves, prefetchCommunityDetail is
 *     called for at most the first 4 joined communities (warms Community
 *     View's own useCommunity() cache — Phase 3.1A's prefetch pattern —
 *     so opening one from the pill bar/Discover doesn't cold-fetch).
 *  2. CommunityFilterBar (the pill bar) is replaced by a matching skeleton
 *     while useMyCommunities is still pending, so pills don't pop in after
 *     the feed has already appeared and the cold-start view isn't left with
 *     a blank gap — reuses useMyCommunities' own isPending, no new loading
 *     architecture.
 *
 * Heavily mocked: FeedScreen pulls in realtime channels, the matchmaking
 * banner, activity logging, and feed persistence, none of which this test
 * cares about — every one of those is stubbed away so only the two
 * behaviors above are exercised.
 */
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: mockRouterPush, back: jest.fn() } }));

jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      background: '#fff',
      card: '#fff',
      text: '#000',
      secondaryText: '#666',
      primary: '#2FC9C1',
      border: '#eee',
    },
    isDark: false,
  }),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: jest.fn() }) }),
    }),
    removeChannel: jest.fn(),
  },
}));

const mockQueryClient = { __fakeQueryClient: true };
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('../../context/FilterContext', () => ({
  useFilterContext: () => ({
    selectedFilter: 'hot',
    setSelectedFilter: jest.fn(),
    hiddenPostIds: [],
  }),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-1' } } }),
}));

jest.mock('../../features/profile/hooks/useMyProfile', () => ({
  useMyProfile: () => ({ data: { id: 'viewer-1', university_id: 'uni-1', is_admin: false } }),
}));

jest.mock('../../hooks/useFeedPosts', () => ({
  useFeedPosts: () => ({
    data: { pages: [[]], pageParams: [0] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

jest.mock('../../components/PostListItem', () => () => null);
jest.mock('../../components/PostListSkeleton', () => () => null);
jest.mock('../../components/CustomInput', () => () => null);
jest.mock('../../components/FullscreenImageModal', () => ({ FullscreenImageModal: () => null }));
jest.mock('../../features/matchmaking/components/MatchmakingBanner', () => () => null);
jest.mock('../../utils/activityLogger', () => ({ logActivity: jest.fn() }));
jest.mock('../../utils/feedPersistence', () => ({
  saveCampusFeedToStorage: jest.fn(),
  saveCommunityFeedToStorage: jest.fn(),
}));

jest.mock('../../features/communities/hooks/useUniversityCommunities', () => ({
  prefetchUniversityCommunitiesFirstPage: jest.fn(),
}));

const mockPrefetchCommunityDetail = jest.fn();
jest.mock('../../features/communities/data/communityDetailQuery', () => ({
  prefetchCommunityDetail: (...args: unknown[]) => mockPrefetchCommunityDetail(...args),
}));

let mockCommunities: any[] = [];
let mockMyCommunitiesPending = false;
jest.mock('../../features/communities/hooks/useMyCommunities', () => ({
  useMyCommunities: () => ({
    joinedIds: new Set(mockCommunities.map((c) => c.id)),
    communities: mockCommunities,
    isPending: mockMyCommunitiesPending,
  }),
  prefetchMyCommunities: jest.fn(),
}));

jest.mock('../../features/communities/components/CommunityFilterBar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(Text, { testID: 'community-filter-bar-marker' }, 'bar'),
  };
});

jest.mock('../../components/CommunityFilterBarSkeleton', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(Text, { testID: 'community-filter-bar-skeleton-marker' }, 'skeleton'),
  };
});

function buildCommunity(id: string) {
  return {
    id,
    name: `Community ${id}`,
    description: null,
    avatar_url: null,
    university_id: 'uni-1',
    created_by: 'someone',
    created_at: new Date().toISOString(),
  };
}

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import FeedScreen from '../../app/(protected)/(tabs)/index';

describe('FeedScreen cold-start community prefetch (Phase 3.1A UX Refinement 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunities = [];
    mockMyCommunitiesPending = false;
  });

  it('prefetches community detail for the first 4 joined communities once useMyCommunities resolves', async () => {
    mockCommunities = ['a', 'b', 'c', 'd', 'e', 'f'].map(buildCommunity);
    render(<FeedScreen />);

    await waitFor(() => {
      expect(mockPrefetchCommunityDetail).toHaveBeenCalledTimes(4);
    });
    expect(mockPrefetchCommunityDetail).toHaveBeenCalledWith(mockQueryClient, 'a');
    expect(mockPrefetchCommunityDetail).toHaveBeenCalledWith(mockQueryClient, 'b');
    expect(mockPrefetchCommunityDetail).toHaveBeenCalledWith(mockQueryClient, 'c');
    expect(mockPrefetchCommunityDetail).toHaveBeenCalledWith(mockQueryClient, 'd');
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalledWith(mockQueryClient, 'e');
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalledWith(mockQueryClient, 'f');
  });

  it('prefetches all of them when the user has 3 or fewer joined communities (does not force exactly 4)', async () => {
    mockCommunities = ['a', 'b'].map(buildCommunity);
    render(<FeedScreen />);

    await waitFor(() => {
      expect(mockPrefetchCommunityDetail).toHaveBeenCalledTimes(2);
    });
  });

  it('does not prefetch anything while useMyCommunities is still pending', () => {
    mockMyCommunitiesPending = true;
    mockCommunities = [];
    render(<FeedScreen />);
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalled();
  });

  it('does not prefetch anything for a user with no joined communities', async () => {
    mockCommunities = [];
    mockMyCommunitiesPending = false;
    render(<FeedScreen />);
    // Nothing to prefetch — give any pending effects a tick, then confirm.
    await waitFor(() => expect(screen.getByTestId('community-filter-bar-marker')).toBeTruthy());
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalled();
  });

  it('shows the community filter bar skeleton while useMyCommunities is pending (no blank gap or partially-loaded community UI)', () => {
    mockMyCommunitiesPending = true;
    render(<FeedScreen />);
    expect(screen.getByTestId('community-filter-bar-skeleton-marker')).toBeTruthy();
    expect(screen.queryByTestId('community-filter-bar-wrapper')).toBeNull();
  });

  it('reveals the community pill bar once useMyCommunities has resolved', async () => {
    mockMyCommunitiesPending = false;
    mockCommunities = [buildCommunity('a')];
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('community-filter-bar-wrapper')).toBeTruthy();
    });
    expect(screen.queryByTestId('community-filter-bar-skeleton-marker')).toBeNull();
  });
});
