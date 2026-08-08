/**
 * Tests for src/app/(protected)/lostfoundpost/[id].tsx (Phase 2, Task 4 —
 * new three-dot menu; Task 1 — delete loading behavior). Mirrors the
 * mocking scaffold established in post-detail.delete-loading.test.tsx,
 * adapted for this screen's dependencies (useNavigation, no comments/poll).
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
  useLocalSearchParams: () => ({ id: 'lf-post-1' }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

// Mutable so a later test can render as a non-owner viewer.
let mockCurrentUserId = 'author-1';
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { get id() { return mockCurrentUserId; } } } }),
}));

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const mockLostFoundPost = {
  post_id: 'lf-post-1',
  user_id: 'author-1',
  username: 'author_user',
  avatar_url: null,
  is_anonymous: false,
  category: 'lost',
  location: 'Library',
  content: 'Lost my keys',
  title: null,
  image_url: null,
  image_urls: null,
  created_at: new Date().toISOString(),
  university_id: 'uni-1',
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockLostFoundPost, isLoading: false, error: null }),
  useQueryClient: () => ({
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock('../../features/profile/hooks/useMyProfile', () => ({
  useMyProfile: () => ({
    data: { id: mockCurrentUserId, username: mockCurrentUserId, is_admin: false },
  }),
}));

jest.mock('../../features/posts/hooks/useReportPost', () => ({
  useReportPost: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../features/posts/hooks/useBlockUser', () => ({
  useBlockUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

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

jest.mock('../../components/ReportModal', () => () => null);
jest.mock('../../components/FullscreenImageModal', () => ({
  FullscreenImageModal: () => null,
  resolvePostImageUri: (uri: string) => uri,
}));
// Avoids exercising the real SVG icon set (getAvatarForEntity's "svg" kind)
// in this test environment — irrelevant to menu/delete behavior under test.
jest.mock('../../components/EntityAvatar', () => () => null);

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import LostFoundPostDetailed from '../../app/(protected)/lostfoundpost/[id]';

function openMenu() {
  const trigger = screen.UNSAFE_getByProps({ name: 'dots-three-horizontal' }).parent;
  fireEvent.press(trigger!);
}

describe('lostfoundpost/[id] three-dot menu + delete loading (Phase 2, Task 1 & 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeletePostIsPending = false;
  });

  it('renders Delete Post for the post owner', () => {
    render(<LostFoundPostDetailed />);
    openMenu();
    expect(screen.getByText('Delete Post')).toBeTruthy();
  });

  it('renders Block User for the post owner\'s own menu (report/block hidden for own post is not required — only delete is owner-gated)', () => {
    render(<LostFoundPostDetailed />);
    openMenu();
    // Report/Block are gated on !isPostOwner, so the owner should not see them.
    expect(screen.queryByText('Report Content')).toBeNull();
    expect(screen.queryByText('Block User')).toBeNull();
  });

  it('shows "Deleting…" and disables the item while a delete is pending', () => {
    mockDeletePostIsPending = true;
    render(<LostFoundPostDetailed />);
    openMenu();
    expect(screen.queryByText('Delete Post')).toBeNull();
    const deleteItem = screen.getByTestId('lostfound-detail-delete-item');
    expect(screen.getByText('Deleting…')).toBeTruthy();
    expect(deleteItem.props.accessibilityState?.disabled).toBe(true);
  });

  it('does not fire a second delete while one is already pending', () => {
    mockDeletePostIsPending = true;
    render(<LostFoundPostDetailed />);
    openMenu();
    const deleteItem = screen.getByTestId('lostfound-detail-delete-item');
    fireEvent.press(deleteItem);
    expect(mockDeletePostMutate).not.toHaveBeenCalled();
  });
});

describe('lostfoundpost/[id] menu for a non-owner viewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeletePostIsPending = false;
    mockCurrentUserId = 'someone-else';
  });

  afterEach(() => {
    mockCurrentUserId = 'author-1';
  });

  it('shows Report Content and Block User but not Delete Post for a non-owner, non-admin viewer', () => {
    render(<LostFoundPostDetailed />);
    openMenu();

    expect(screen.getByText('Report Content')).toBeTruthy();
    expect(screen.getByText('Block User')).toBeTruthy();
    expect(screen.queryByText('Delete Post')).toBeNull();
  });
});
