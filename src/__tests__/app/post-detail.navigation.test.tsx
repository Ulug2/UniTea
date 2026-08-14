/**
 * Tests for src/app/(protected)/post/[id].tsx's Phase 3.1C navigation
 * behavior: navigateBack must prefer router.back() for organic in-app
 * navigation, but derive a community-aware (or Campus Feed) fallback via
 * router.replace() for external entry (fromDeeplink=1 — shared by deep
 * links, shared links, and post-related push notifications). Mirrors the
 * mocking scaffold already established in post-detail.delete-loading.test.tsx.
 */
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
    replace: (...args: unknown[]) => mockRouterReplace(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
    canGoBack: () => mockCanGoBack,
  },
  useLocalSearchParams: () => mockSearchParams,
  Stack: { Screen: () => null },
}));

let mockSearchParams: { id: string; fromDeeplink?: string } = { id: 'post-1' };

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 0,
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, style }: any) =>
      require('react').createElement(RN.View, { style }, children),
  };
});

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

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-1' } } }),
}));

jest.mock('../../context/FilterContext', () => ({
  useFilterContext: () => ({ hidePost: jest.fn() }),
}));

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../hooks/useBlocks', () => ({
  useBlocks: () => ({ data: [] }),
  hasBlockForScope: () => false,
}));

let mockDetailedPost: any = {
  post_id: 'post-1',
  user_id: 'author-1',
  username: 'author_user',
  avatar_url: null,
  is_anonymous: false,
  is_verified: false,
  is_banned: false,
  university_domain: 'nu.edu.kz',
  community_id: null,
  community_name: null,
  community_avatar_url: null,
  content: 'Some post content',
  title: null,
  image_url: null,
  image_urls: null,
  created_at: new Date().toISOString(),
  vote_score: 0,
  comment_count: 0,
  user_vote: null,
  post_type: 'feed',
  is_author_blocked_by_viewer: false,
  is_original_author_blocked_by_viewer: false,
};
let mockPostError: unknown = null;

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: any) => {
    if (Array.isArray(queryKey) && queryKey[0] === 'post') {
      return { data: mockDetailedPost, isLoading: false, error: mockPostError };
    }
    return { data: [], isLoading: false, error: null };
  },
  useQueryClient: () => ({
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
    refetchQueries: jest.fn(),
    cancelQueries: jest.fn(),
  }),
}));

jest.mock('../../features/comments/hooks/usePostComments', () => ({
  usePostComments: () => ({
    flatComments: [],
    treeComments: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));

jest.mock('../../features/profile/hooks/useMyProfile', () => ({
  useMyProfile: () => ({
    data: { id: 'viewer-1', username: 'viewer-1', is_admin: false },
  }),
}));

jest.mock('../../features/posts/hooks/useBookmarkToggle', () => ({
  useBookmarkToggle: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../features/posts/hooks/useDeletePost', () => ({
  useDeletePost: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../features/posts/hooks/useReportPost', () => ({
  useReportPost: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../features/posts/hooks/useBlockUser', () => ({
  useBlockUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../features/comments/components/CommentsTreeList', () => ({
  CommentsTreeList: () => null,
}));

jest.mock('../../features/posts/components/PostHeaderCard', () => ({
  PostHeaderCard: () => null,
}));

jest.mock('../../components/ReportModal', () => () => null);
jest.mock('../../components/FullscreenImageModal', () => ({
  FullscreenImageModal: () => null,
}));

jest.mock('../../features/comments/components/CommentComposer', () => {
  const React = require('react');
  return {
    CommentComposer: React.forwardRef(() => null),
  };
});

jest.mock('../../features/comments/hooks/useCreateComment', () => ({
  useCreateComment: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

import React from 'react';
import { Platform } from 'react-native';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import PostDetailed from '../../app/(protected)/post/[id]';

// Same rationale as post-detail.delete-loading.test.tsx: Stack.Screen is
// mocked away, so iOS's headerLeft render-prop never fires. Forcing
// 'android' makes the plain in-tree close button reachable via RTL — but it
// also means every close/back interaction runs through closeScreen's
// Android slide-out Animated.timing before calling navigateBack, so fake
// timers are required to resolve that animation's completion callback
// synchronously within the test.
beforeAll(() => {
  Platform.OS = 'android';
});
afterAll(() => {
  Platform.OS = 'ios';
});

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function pressClose() {
  const trigger = screen.UNSAFE_getByProps({ name: 'close' });
  act(() => {
    trigger.props.onPress();
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });
}

function pressBackToFeed() {
  const trigger = screen.getByTestId('post-detail-back-to-feed');
  act(() => {
    fireEvent.press(trigger);
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });
}

describe('post/[id] navigation (Phase 3.1C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = true;
    mockSearchParams = { id: 'post-1' };
    mockPostError = null;
    mockDetailedPost = {
      post_id: 'post-1',
      user_id: 'author-1',
      username: 'author_user',
      avatar_url: null,
      is_anonymous: false,
      is_verified: false,
      is_banned: false,
      university_domain: 'nu.edu.kz',
      community_id: null,
      community_name: null,
      community_avatar_url: null,
      content: 'Some post content',
      title: null,
      image_url: null,
      image_urls: null,
      created_at: new Date().toISOString(),
      vote_score: 0,
      comment_count: 0,
      user_vote: null,
      post_type: 'feed',
      is_author_blocked_by_viewer: false,
      is_original_author_blocked_by_viewer: false,
    };
  });

  // ── Organic in-app navigation (must not regress) ───────────────────────
  it('Community View → Post Detail → Back uses router.back(), not replace', () => {
    mockDetailedPost.community_id = 'community-1';
    mockCanGoBack = true;
    render(<PostDetailed />);
    pressClose();
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('Campus Feed → Post Detail → Back uses router.back(), not replace', () => {
    mockDetailedPost.community_id = null;
    mockCanGoBack = true;
    render(<PostDetailed />);
    pressClose();
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // ── External entry ──────────────────────────────────────────────────────
  it('external community post falls back to that community\'s Community View', () => {
    mockSearchParams = { id: 'post-1', fromDeeplink: '1' };
    mockDetailedPost.community_id = 'community-42';
    render(<PostDetailed />);
    pressClose();
    expect(mockRouterReplace).toHaveBeenCalledWith('/communities/community-42');
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('external Campus post falls back to the Campus Feed', () => {
    mockSearchParams = { id: 'post-1', fromDeeplink: '1' };
    mockDetailedPost.community_id = null;
    render(<PostDetailed />);
    pressClose();
    expect(mockRouterReplace).toHaveBeenCalledWith('/(protected)/(tabs)');
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('external community post does NOT blindly trust an available back stack', () => {
    mockSearchParams = { id: 'post-1', fromDeeplink: '1' };
    mockDetailedPost.community_id = 'community-7';
    mockCanGoBack = true; // stack IS available, but must still be ignored
    render(<PostDetailed />);
    pressClose();
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledWith('/communities/community-7');
  });

  it('reads the community id directly from detailedPost.community_id', () => {
    mockSearchParams = { id: 'post-1', fromDeeplink: '1' };
    mockDetailedPost.community_id = 'a-totally-different-id';
    render(<PostDetailed />);
    pressClose();
    expect(mockRouterReplace).toHaveBeenCalledWith('/communities/a-totally-different-id');
  });

  it('organic entry with no back stack still prefers the community fallback over Campus Feed', () => {
    mockSearchParams = { id: 'post-1' }; // not external
    mockCanGoBack = false; // cold start, nothing to go back to
    mockDetailedPost.community_id = 'community-9';
    render(<PostDetailed />);
    pressClose();
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledWith('/communities/community-9');
  });

  // ── Error / not-found / blocked states ──────────────────────────────────
  it('post-not-found state falls back to Campus Feed, never /communities/undefined', () => {
    mockSearchParams = { id: 'post-1', fromDeeplink: '1' };
    mockDetailedPost = null; // simulates a deleted post / deleted community cascade
    render(<PostDetailed />);
    pressBackToFeed();
    expect(mockRouterReplace).toHaveBeenCalledWith('/(protected)/(tabs)');
    const undefinedCalls = mockRouterReplace.mock.calls.filter(([dest]) =>
      String(dest).includes('undefined'),
    );
    expect(undefinedCalls).toHaveLength(0);
  });

  it('postError state uses the unified navigation helper and falls back to Campus Feed', () => {
    mockSearchParams = { id: 'post-1', fromDeeplink: '1' };
    mockPostError = new Error('network error');
    render(<PostDetailed />);
    pressBackToFeed();
    expect(mockRouterReplace).toHaveBeenCalledWith('/(protected)/(tabs)');
  });

  it('blocked-author state on an external community post still returns to that Community View', () => {
    mockSearchParams = { id: 'post-1', fromDeeplink: '1' };
    mockDetailedPost.community_id = 'community-blocked';
    mockDetailedPost.is_author_blocked_by_viewer = true;
    render(<PostDetailed />);
    pressBackToFeed();
    expect(mockRouterReplace).toHaveBeenCalledWith('/communities/community-blocked');
  });

  it('blocked-author state on an organic (non-external) Campus post still uses router.back()', () => {
    mockSearchParams = { id: 'post-1' }; // organic
    mockCanGoBack = true;
    mockDetailedPost.community_id = null;
    mockDetailedPost.is_author_blocked_by_viewer = true;
    render(<PostDetailed />);
    pressBackToFeed();
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
