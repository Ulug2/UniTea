/**
 * Tests for the Discover (community directory) screen's Phase 3.1A
 * navigation wiring: tapping a community row must prefetch the Community
 * View's own query and push to /communities/[id] — CommunityDirectoryItem's
 * onPress prop existed before this phase but was never passed by the
 * parent; this test protects that wiring going forward.
 */
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../components/SupabaseImage', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});

jest.mock('../../components/EntityAvatar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});

const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: any) => children,
}));

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

const mockCommunities = [
  {
    id: 'community-1',
    name: 'Chess Club',
    description: 'Chess lovers unite.',
    avatar_url: null,
    university_id: 'uni-1',
    created_by: 'owner-1',
    created_at: '2026-01-01T00:00:00Z',
    member_count: 5,
  },
];

jest.mock('../../features/communities/hooks/useUniversityCommunities', () => ({
  useUniversityCommunities: () => ({
    communities: mockCommunities,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isInitialLoading: false,
    isProfileFetched: true,
    universityId: 'uni-1',
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

jest.mock('../../features/communities/hooks/useMyCommunities', () => ({
  useMyCommunities: () => ({ joinedIds: new Set(), isPending: false }),
}));

jest.mock('../../features/communities/hooks/useCommunityMembership', () => ({
  useJoinCommunity: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useLeaveCommunity: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const mockPrefetchCommunityDetail = jest.fn();
jest.mock('../../features/communities/data/communityDetailQuery', () => ({
  prefetchCommunityDetail: (...args: unknown[]) => mockPrefetchCommunityDetail(...args),
}));

const mockQueryClient = { __fakeQueryClient: true };
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import CommunityDirectoryScreen from '../../app/(protected)/communities/index';

describe('Discover screen navigation (Phase 3.1A)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to the community view when a row is tapped', async () => {
    render(<CommunityDirectoryScreen />);
    await waitFor(() => screen.getByText('Chess Club'));
    fireEvent.press(screen.getByText('Chess Club'));
    expect(mockRouterPush).toHaveBeenCalledWith('/communities/community-1');
  });

  it('prefetches the community detail query using the same query client before navigating', async () => {
    render(<CommunityDirectoryScreen />);
    await waitFor(() => screen.getByText('Chess Club'));
    fireEvent.press(screen.getByText('Chess Club'));
    expect(mockPrefetchCommunityDetail).toHaveBeenCalledWith(mockQueryClient, 'community-1');
  });

  it('tapping the Join button does not also trigger navigation', async () => {
    render(<CommunityDirectoryScreen />);
    await waitFor(() => screen.getByText('Join'));
    fireEvent.press(screen.getByText('Join'));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalled();
  });
});
