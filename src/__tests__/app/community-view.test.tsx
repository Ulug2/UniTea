/**
 * Tests for src/app/(protected)/communities/[id]/index.tsx — the Phase
 * 3.1A Community Preview/View screen. Mirrors the mocking scaffold
 * established in post-detail.delete-loading.test.tsx /
 * lostfound-detail.menu-and-delete.test.tsx (Phase 2).
 */
const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
  useLocalSearchParams: () => ({ id: 'community-1' }),
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
      error: '#EF4444',
    },
    isDark: false,
  }),
}));

let mockCurrentUserId: string | undefined = 'me';
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { get id() { return mockCurrentUserId; } } },
    cachedProfile: null,
  }),
}));

const mockSetSelectedFilter = jest.fn();
jest.mock('../../context/FilterContext', () => ({
  useFilterContext: () => ({
    hiddenPostIds: [],
    selectedFilter: 'hot',
    setSelectedFilter: mockSetSelectedFilter,
  }),
}));

let mockIsAdmin = false;
jest.mock('../../features/profile/hooks/useMyProfile', () => ({
  useMyProfile: () => ({
    data: { id: 'me', university_id: 'uni-1', is_admin: mockIsAdmin },
  }),
}));

// ── Mutable mocks under test ────────────────────────────────────────────
let mockCommunityData: any = {
  id: 'community-1',
  name: 'Chess Club',
  description: 'A place for chess lovers.',
  avatar_url: null,
  created_by: 'owner-1',
  university_id: 'uni-1',
  updated_at: null,
};
let mockCommunityPending = false;

jest.mock('../../features/communities/hooks/useCommunity', () => ({
  useCommunity: () => ({
    data: mockCommunityData,
    isPending: mockCommunityPending,
  }),
}));

let mockJoinedIds = new Set<string>();
jest.mock('../../features/communities/hooks/useMyCommunities', () => ({
  useMyCommunities: () => ({ joinedIds: mockJoinedIds }),
}));

// Optimistic, not awaited (see communities/[id]/index.tsx's own comment on
// handleToggleMembership) — the screen calls mutate(), not mutateAsync(),
// and never reads isPending. Rollback/optimistic-cache behavior itself is
// useJoinCommunity/useLeaveCommunity's own responsibility, already fully
// covered by useCommunityMembership.test.ts (untouched this phase).
const mockJoinMutate = jest.fn();
const mockLeaveMutate = jest.fn();

jest.mock('../../features/communities/hooks/useCommunityMembership', () => ({
  useJoinCommunity: () => ({ mutate: mockJoinMutate }),
  useLeaveCommunity: () => ({ mutate: mockLeaveMutate }),
}));

let mockPostsData: any = { pages: [[]], pageParams: [0] };
let mockPostsPending = false;
const mockFetchNextPage = jest.fn();

jest.mock('../../hooks/useFeedPosts', () => ({
  useFeedPosts: () => ({
    data: mockPostsData,
    fetchNextPage: mockFetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: mockPostsPending,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

const mockGetQueryData = jest.fn(() => undefined);
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: mockGetQueryData }),
}));

let lastPostListItemProps: any = null;
jest.mock('../../components/PostListItem', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => {
      lastPostListItemProps = props;
      return React.createElement(Text, { testID: `post-${props.postId}` }, props.content);
    },
  };
});

jest.mock('../../components/SupabaseImage', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onLoad }: any) => {
      React.useEffect(() => { onLoad?.(); }, [onLoad]);
      return React.createElement(View, { testID: 'community-avatar-image' });
    },
  };
});

jest.mock('../../components/EntityAvatar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onLoad }: any) => {
      React.useEffect(() => { onLoad?.(); }, [onLoad]);
      return React.createElement(View, { testID: 'community-avatar-fallback' });
    },
  };
});

jest.mock('../../components/FullscreenImageModal', () => ({
  FullscreenImageModal: () => null,
}));

let mockReportIsPending = false;
const mockReportMutate = jest.fn();
let capturedReportCommunityOptions: any = null;
jest.mock('../../features/communities/hooks/useReportCommunity', () => ({
  useReportCommunity: (options: any) => {
    capturedReportCommunityOptions = options;
    return {
      mutate: mockReportMutate,
      get isPending() { return mockReportIsPending; },
    };
  },
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { verticalScale } from '../../utils/scaling';
import CommunityViewScreen from '../../app/(protected)/communities/[id]/index';

/** Resolves StyleSheet.create's numeric ids (not just plain inline objects
 * spread across an array) down to a single merged style object. */
function flattenStyle(style: unknown): Record<string, any> {
  return { ...(StyleSheet.flatten(style as any) ?? {}) };
}

describe('Community View screen (Phase 3.1A)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUserId = 'me';
    mockIsAdmin = false;
    mockCommunityData = {
      id: 'community-1',
      name: 'Chess Club',
      description: 'A place for chess lovers.',
      avatar_url: null,
      created_by: 'owner-1',
      university_id: 'uni-1',
      updated_at: null,
    };
    mockCommunityPending = false;
    mockJoinedIds = new Set<string>();
    mockPostsData = { pages: [[]], pageParams: [0] };
    mockPostsPending = false;
    mockGetQueryData.mockReturnValue(undefined);
    mockReportIsPending = false;
    capturedReportCommunityOptions = null;
    lastPostListItemProps = null;
  });

  // ── Metadata ─────────────────────────────────────────────────────────
  it('renders the community name', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => {
      expect(screen.getAllByText('Chess Club').length).toBeGreaterThan(0);
    });
  });

  it('renders the community description', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => {
      expect(screen.getByText('A place for chess lovers.')).toBeTruthy();
    });
  });

  it('renders the community avatar (fallback when no avatar_url)', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('community-avatar-fallback')).toBeTruthy();
    });
  });

  it('renders the real avatar image when avatar_url is set', async () => {
    mockCommunityData = { ...mockCommunityData, avatar_url: 'community-1/avatar.jpg' };
    render(<CommunityViewScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('community-avatar-image')).toBeTruthy();
    });
  });

  it('shows a loading state while the community query is pending', () => {
    mockCommunityPending = true;
    render(<CommunityViewScreen />);
    expect(screen.queryByText('Chess Club')).toBeNull();
  });

  it('shows a "no longer exists" state when the community is missing', () => {
    mockCommunityData = undefined;
    render(<CommunityViewScreen />);
    expect(screen.getByText('This community no longer exists.')).toBeTruthy();
  });

  // ── Membership (UX Refinement 2: full-width CTA, optimistic, no spinner) ──
  it('shows "Join Community" for a non-member', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByText('Join Community')).toBeTruthy());
  });

  it('shows "Leave Community" for a member', async () => {
    mockJoinedIds = new Set(['community-1']);
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByText('Leave Community')).toBeTruthy());
  });

  it('calls the join mutation synchronously (mutate, not mutateAsync) when a non-member taps Join Community', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByText('Join Community'));
    fireEvent.press(screen.getByText('Join Community'));
    expect(mockJoinMutate).toHaveBeenCalledWith(mockCommunityData);
  });

  it('calls the leave mutation synchronously when a member taps Leave Community', async () => {
    mockJoinedIds = new Set(['community-1']);
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByText('Leave Community'));
    fireEvent.press(screen.getByText('Leave Community'));
    expect(mockLeaveMutate).toHaveBeenCalledWith('community-1');
  });

  it('never shows a loading spinner or disabled state on the Join/Leave button', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByText('Join Community'));
    const button = screen.getByText('Join Community').parent!;
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(button);
    // Still no spinner/disabled after tapping — the screen never reads
    // joinMutation.isPending/leaveMutation.isPending at all anymore.
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
  });

  // ── Posts ────────────────────────────────────────────────────────────
  it('renders community posts', async () => {
    mockPostsData = {
      pages: [[
        { post_id: 'p1', content: 'Hello from Chess Club', community_id: 'community-1' },
      ]],
      pageParams: [0],
    };
    render(<CommunityViewScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('post-p1')).toBeTruthy();
      expect(screen.getByText('Hello from Chess Club')).toBeTruthy();
    });
  });

  it('disables community-avatar navigation on its own posts (they already belong to this community)', async () => {
    mockPostsData = {
      pages: [[
        { post_id: 'p1', content: 'Hello from Chess Club', community_id: 'community-1' },
      ]],
      pageParams: [0],
    };
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByTestId('post-p1')).toBeTruthy());
    expect(lastPostListItemProps.disableCommunityNavigation).toBe(true);
  });

  it('passes imagesAssumeCached once posts data has resolved (cache reuse, no image pop-in)', async () => {
    mockPostsData = {
      pages: [[
        { post_id: 'p1', content: 'Hello from Chess Club', community_id: 'community-1' },
      ]],
      pageParams: [0],
    };
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByTestId('post-p1')).toBeTruthy());
    expect(lastPostListItemProps.imagesAssumeCached).toBe(true);
  });

  it('shows "No posts yet." for an empty community once loaded', async () => {
    mockPostsData = { pages: [[]], pageParams: [0] };
    mockPostsPending = false;
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByText('No posts yet.')).toBeTruthy());
  });

  it('still shows the header (name + Join Community) for an empty community', async () => {
    mockPostsData = { pages: [[]], pageParams: [0] };
    render(<CommunityViewScreen />);
    await waitFor(() => {
      expect(screen.getAllByText('Chess Club').length).toBeGreaterThan(0);
      expect(screen.getByText('Join Community')).toBeTruthy();
    });
  });

  // ── Owner / admin: floating settings button (replaces the old profile
  // Manage Community link — UX Refinement 2) ──────────────────────────
  it('shows the settings floating button for the owner', async () => {
    mockCurrentUserId = 'owner-1';
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByTestId('community-settings-fab')).toBeTruthy());
  });

  it('shows the settings floating button for an admin who is not the owner', async () => {
    mockIsAdmin = true;
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByTestId('community-settings-fab')).toBeTruthy());
  });

  it('does not show the settings floating button for a regular member', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getAllByText('Chess Club').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('community-settings-fab')).toBeNull();
  });

  it('does not render a "Manage community" text link in the profile section anymore', async () => {
    mockCurrentUserId = 'owner-1';
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByTestId('community-settings-fab')).toBeTruthy());
    expect(screen.queryByText('Manage community')).toBeNull();
  });

  it('navigates to the manage screen when the settings floating button is tapped', async () => {
    mockCurrentUserId = 'owner-1';
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-settings-fab'));
    fireEvent.press(screen.getByTestId('community-settings-fab'));
    expect(mockRouterPush).toHaveBeenCalledWith('/communities/community-1/manage');
  });

  // ── Floating create-post button ──────────────────────────────────────
  it('shows the create-post floating button for a regular member', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByTestId('community-create-post-fab')).toBeTruthy());
  });

  it('shows the create-post floating button for the owner too', async () => {
    mockCurrentUserId = 'owner-1';
    render(<CommunityViewScreen />);
    await waitFor(() => expect(screen.getByTestId('community-create-post-fab')).toBeTruthy());
  });

  it('navigates to create-post scoped to this community when the create button is tapped', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-create-post-fab'));
    fireEvent.press(screen.getByTestId('community-create-post-fab'));
    expect(mockRouterPush).toHaveBeenCalledWith('/create-post?communityId=community-1');
  });

  // ── Isolation from Home Feed's global filter state ──────────────────────
  it('never calls the global setSelectedFilter, even while joining/leaving', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByText('Join Community'));
    fireEvent.press(screen.getByText('Join Community'));
    expect(mockJoinMutate).toHaveBeenCalled();
    expect(mockSetSelectedFilter).not.toHaveBeenCalled();
  });

  // ── Report Community (Phase 3.1B) ────────────────────────────────────
  it('opens a menu with a "Report Community" action from the three-dot button', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByTestId('community-menu-button'));
    expect(screen.getByText('Report Community')).toBeTruthy();
  });

  it('opens ReportModal when "Report Community" is selected', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByText('Report Community'));
    expect(screen.getByText("What's wrong with this community?")).toBeTruthy();
  });

  it('uses the route\'s own loaded community id for the report mutation, not any other source', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-menu-button'));
    expect(capturedReportCommunityOptions).toMatchObject({ communityId: 'community-1' });
  });

  it('submits the report reason and closes the modal on submit', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByText('Report Community'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Describe the issue...'),
      'spam community',
    );
    fireEvent.press(screen.getByText('Submit'));

    expect(mockReportMutate).toHaveBeenCalledWith('spam community');
    await waitFor(() => {
      expect(screen.queryByText("What's wrong with this community?")).toBeNull();
    });
  });

  it('disables the submit button while a report is already pending (no duplicate submissions)', async () => {
    mockReportIsPending = true;
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByText('Report Community'));

    expect(screen.queryByText('Submit')).toBeNull();
  });

  it('does not show delete/block/leave/manage actions in the report menu', async () => {
    mockCurrentUserId = 'owner-1'; // even for the owner
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-menu-button'));
    fireEvent.press(screen.getByTestId('community-menu-button'));
    expect(screen.queryByText(/delete community/i)).toBeNull();
    expect(screen.queryByText(/block community/i)).toBeNull();
    expect(screen.queryByText(/^leave$/i)).toBeNull();
  });

  // ── Visual Polish (Refinement 3) ─────────────────────────────────────
  // These check the underlying style *values* React Native would render
  // with — real pixel/layout rendering isn't something Jest/RNTL can
  // verify, so this is a structural regression guard, not a substitute for
  // looking at the screen.
  it('the profile top row centers the name/description column against the avatar (alignItems: center)', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-profile-top-row'));
    const row = screen.getByTestId('community-profile-top-row');
    expect(flattenStyle(row.props.style).alignItems).toBe('center');
  });

  it('the post list has no outer horizontal padding, so the divider and post rows reach both screen edges', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-posts-list'));
    const list = screen.getByTestId('community-posts-list');
    const contentStyle = flattenStyle(list.props.contentContainerStyle);
    expect(contentStyle.paddingHorizontal).toBeUndefined();
  });

  it('the Join/Leave button is compact (reduced height), not a tall banner', async () => {
    render(<CommunityViewScreen />);
    await waitFor(() => screen.getByTestId('community-join-leave-button'));
    const buttonStyle = flattenStyle(
      screen.getByTestId('community-join-leave-button').props.style,
    );
    // Was verticalScale(52) before this refinement — must be meaningfully
    // shorter, and match the exact new compact value.
    expect(buttonStyle.minHeight).toBe(verticalScale(40));
    expect(buttonStyle.minHeight).toBeLessThan(verticalScale(52));
    expect(buttonStyle.width).toBe('100%');
  });
});
