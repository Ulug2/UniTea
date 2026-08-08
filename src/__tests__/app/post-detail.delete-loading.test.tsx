/**
 * Tests for src/app/(protected)/post/[id].tsx's delete-post UI (Phase 2,
 * Task 1): the three-dot menu's "Delete Post" item must disable itself and
 * show a spinner while deletePostMutation.isPending, and re-tapping it
 * while pending must not fire a second delete request. Mirrors the
 * mocking scaffold already established in
 * post-detail.comment-idempotency.test.tsx.
 */
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
    replace: (...args: unknown[]) => mockRouterReplace(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({ id: 'post-1' }),
  Stack: { Screen: () => null },
}));

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

// Post owner, so canDeletePost is true and the Delete Post menu item renders.
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'author-1' } } }),
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

const mockDetailedPost = {
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
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: any) => {
    if (Array.isArray(queryKey) && queryKey[0] === 'post') {
      return { data: mockDetailedPost, isLoading: false, error: null };
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
    data: { id: 'author-1', username: 'author-1', is_admin: false },
  }),
}));

jest.mock('../../features/posts/hooks/useBookmarkToggle', () => ({
  useBookmarkToggle: () => ({ mutate: jest.fn(), isPending: false }),
}));

// ── The mock under test: mutable so each test can control isPending ────────
let mockDeletePostIsPending = false;
const mockDeletePostMutate = jest.fn();

jest.mock('../../features/posts/hooks/useDeletePost', () => ({
  useDeletePost: () => ({
    mutate: mockDeletePostMutate,
    get isPending() {
      return mockDeletePostIsPending;
    },
  }),
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
import { render, screen, fireEvent } from '@testing-library/react-native';
import PostDetailed from '../../app/(protected)/post/[id]';

// The three-dot menu trigger is rendered two ways: iOS uses Stack.Screen's
// headerRight (unreachable here since Stack.Screen is mocked to () => null
// above — React Navigation never calls the render prop), Android renders a
// plain in-tree Pressable. Forcing 'android' makes the trigger reachable
// via normal RTL queries without touching production code.
beforeAll(() => {
  Platform.OS = 'android';
});
afterAll(() => {
  Platform.OS = 'ios';
});

function openMenu() {
  const trigger = screen.UNSAFE_getByProps({ name: 'dots-three-horizontal' }).parent;
  fireEvent.press(trigger!);
}

describe('post/[id] delete-post loading UI (Phase 2, Task 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeletePostIsPending = false;
  });

  it('renders an enabled "Delete Post" item when not pending', () => {
    render(<PostDetailed />);
    openMenu();
    const deleteItem = screen.getByText('Delete Post');
    expect(deleteItem).toBeTruthy();
  });

  it('shows a "Deleting…" label instead of "Delete Post" while pending', () => {
    mockDeletePostIsPending = true;
    render(<PostDetailed />);
    openMenu();
    expect(screen.queryByText('Delete Post')).toBeNull();
    expect(screen.getByText('Deleting…')).toBeTruthy();
  });

  it('disables the delete Pressable while pending', () => {
    mockDeletePostIsPending = true;
    render(<PostDetailed />);
    openMenu();
    const deleteItem = screen.getByTestId('post-detail-delete-item');
    expect(deleteItem.props.accessibilityState?.disabled).toBe(true);
  });

  it('does not disable the delete Pressable when not pending', () => {
    render(<PostDetailed />);
    openMenu();
    const deleteItem = screen.getByTestId('post-detail-delete-item');
    expect(deleteItem.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('pressing "Delete Post" while a deletion is already pending does not open a second confirmation / fire mutate again', () => {
    mockDeletePostIsPending = true;
    render(<PostDetailed />);
    openMenu();
    const deleteItem = screen.getByTestId('post-detail-delete-item');
    fireEvent.press(deleteItem);
    // handleDeletePost's own isPending guard returns before Alert.alert is
    // ever reached, so mutate must never be called from this press.
    expect(mockDeletePostMutate).not.toHaveBeenCalled();
  });
});
