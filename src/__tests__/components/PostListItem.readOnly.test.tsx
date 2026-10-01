/**
 * PostListItem's readOnly mode (used only by the web post card preview,
 * src/app/preview/post-card.tsx): every interaction with a side effect —
 * voting, comment/repost navigation, sharing, anonymous chat, profile and
 * community taps, the repost's original-post tap and the card's own link —
 * must be inert, while the default (mobile) mode keeps all of them working.
 * Each readOnly assertion is paired with the same press in default mode, so
 * a press helper that silently stopped dispatching would fail the suite.
 */
const mockRouterPush = jest.fn();
const mockLinkRendered = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: (...args: unknown[]) => mockRouterPush(...args) },
    Link: ({ href, children }: any) => {
      mockLinkRendered(href);
      return children;
    },
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) =>
    React.createElement(Text, null, `icon:${name}`);
  return { Ionicons: Icon, AntDesign: Icon };
});

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ name }: { name: string }) =>
    React.createElement(Text, null, `icon:${name}`);
});

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

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

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-1' } } }),
}));

const mockHandleUpvote = jest.fn();
const mockHandleDownvote = jest.fn();
const mockUseVote = jest.fn();
jest.mock('../../hooks/useVote', () => ({
  useVote: (options: unknown) => {
    mockUseVote(options);
    return {
      userVote: null,
      score: 7,
      handleUpvote: mockHandleUpvote,
      handleDownvote: mockHandleDownvote,
    };
  },
}));

const mockAnonChatMutate = jest.fn();
jest.mock('../../features/chat/hooks/useInitiateAnonymousChat', () => ({
  useInitiateAnonymousChat: () => ({ mutate: mockAnonChatMutate, isPending: false }),
}));

jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));

const mockSharePost = jest.fn();
jest.mock('../../utils/sharePost', () => ({
  sharePost: (...args: unknown[]) => mockSharePost(...args),
}));

const mockPrefetchCommunityDetail = jest.fn();
jest.mock('../../features/communities/data/communityDetailQuery', () => ({
  prefetchCommunityDetail: (...args: unknown[]) => mockPrefetchCommunityDetail(...args),
}));

const mockPrefetchPostDetail = jest.fn();
jest.mock('../../features/posts/data/postDetailQuery', () => ({
  prefetchPostDetail: (...args: unknown[]) => mockPrefetchPostDetail(...args),
}));

const mockPollProps = jest.fn();
jest.mock('../../components/Poll', () => (props: unknown) => {
  mockPollProps(props);
  return null;
});

const mockProfileModal = jest.fn();
jest.mock('../../components/UserProfileModal', () => (props: unknown) => {
  mockProfileModal(props);
  return null;
});

jest.mock('../../components/EntityAvatar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import PostListItem from '../../components/PostListItem';

const BASE_PROPS = {
  postId: 'post-1',
  userId: 'author-1',
  content: 'Hello world',
  title: null,
  imageUrl: null,
  imageUrls: null,
  imageAspectRatio: null,
  category: null,
  location: null,
  postType: 'feed',
  isAnonymous: false,
  isEdited: false,
  createdAt: new Date().toISOString(),
  username: 'author_user',
  avatarUrl: null,
  isVerified: false,
  universityDomain: 'nu.edu.kz',
  commentCount: 3,
  voteScore: 7,
  userVote: null,
} as const;

const REPOST_PROPS = {
  ...BASE_PROPS,
  repostedFromPostId: 'original-1',
  originalContent: 'Original content',
  originalUserId: 'original-author',
};

const COMMUNITY_ANON_PROPS = {
  ...BASE_PROPS,
  userId: null,
  username: null,
  isAnonymous: true,
  communityId: 'community-1',
  communityName: 'Chess Club',
};

const pressEvent = { preventDefault: jest.fn(), stopPropagation: jest.fn() };

function pressByText(text: string) {
  fireEvent.press(screen.getByText(text), pressEvent);
}

const FOOTER_ACTIONS = [
  'icon:arrow-up-bold-outline',
  'icon:arrow-down-bold-outline',
  'icon:comment-outline',
  'icon:repeat-outline',
  'icon:share-outline',
];

function pressAllFooterActions({ includeChat }: { includeChat: boolean }) {
  [...FOOTER_ACTIONS, ...(includeChat ? ['icon:paper-plane-outline'] : [])].forEach(
    pressByText,
  );
}

function expectNoSideEffects() {
  expect(mockHandleUpvote).not.toHaveBeenCalled();
  expect(mockHandleDownvote).not.toHaveBeenCalled();
  expect(mockRouterPush).not.toHaveBeenCalled();
  expect(mockSharePost).not.toHaveBeenCalled();
  expect(mockAnonChatMutate).not.toHaveBeenCalled();
  expect(mockPrefetchPostDetail).not.toHaveBeenCalled();
  expect(mockPrefetchCommunityDetail).not.toHaveBeenCalled();
  expect(mockProfileModal).not.toHaveBeenCalled();
}

describe('PostListItem readOnly (web post card preview)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('default mode: footer actions, author tap and card link all work (control)', () => {
    render(<PostListItem {...BASE_PROPS} />);
    pressAllFooterActions({ includeChat: true });
    pressByText('author_user');

    expect(mockHandleUpvote).toHaveBeenCalledTimes(1);
    expect(mockHandleDownvote).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith('/post/post-1');
    expect(mockRouterPush).toHaveBeenCalledWith('/create-post?repostId=post-1');
    expect(mockSharePost).toHaveBeenCalledWith('post-1');
    expect(mockAnonChatMutate).toHaveBeenCalledTimes(1);
    expect(mockProfileModal).toHaveBeenCalled();
    expect(mockLinkRendered).toHaveBeenCalledWith('/post/post-1');
    expect(mockUseVote).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: false }),
    );
    expect(mockPollProps).toHaveBeenCalledWith({ postId: 'post-1', readOnly: false });
  });

  it('readOnly: renders the same content but no action has any side effect', () => {
    render(<PostListItem {...BASE_PROPS} readOnly />);

    expect(screen.getByText('author_user')).toBeTruthy();
    expect(screen.getByText('Hello world')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();

    pressAllFooterActions({ includeChat: false });
    pressByText('author_user');
    pressByText('Hello world');

    expectNoSideEffects();
    expect(mockLinkRendered).not.toHaveBeenCalled();
  });

  it('readOnly: the anonymous-chat button is not rendered at all', () => {
    const normal = render(<PostListItem {...BASE_PROPS} />);
    expect(normal.getByText('icon:paper-plane-outline')).toBeTruthy();
    normal.unmount();

    const preview = render(<PostListItem {...BASE_PROPS} readOnly />);
    expect(preview.getByText('icon:share-outline')).toBeTruthy();
    expect(preview.queryByText('icon:paper-plane-outline')).toBeNull();
  });

  it('readOnly: puts useVote and Poll in their read-only modes', () => {
    render(<PostListItem {...BASE_PROPS} readOnly />);
    expect(mockUseVote).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1', readOnly: true }),
    );
    expect(mockPollProps).toHaveBeenCalledWith({ postId: 'post-1', readOnly: true });
  });

  it('readOnly repost: the original-post card does not navigate or prefetch', () => {
    render(<PostListItem {...REPOST_PROPS} />);
    pressByText('Original content');
    expect(mockRouterPush).toHaveBeenCalledWith('/post/original-1');

    jest.clearAllMocks();
    render(<PostListItem {...REPOST_PROPS} readOnly />);
    pressByText('Original content');
    expectNoSideEffects();
    expect(mockPollProps).toHaveBeenCalledWith({ postId: 'original-1', readOnly: true });
  });

  it('readOnly anonymous community post: identity tap does not open Community View', () => {
    render(<PostListItem {...COMMUNITY_ANON_PROPS} />);
    pressByText('Chess Club');
    expect(mockRouterPush).toHaveBeenCalledWith('/communities/community-1');

    jest.clearAllMocks();
    render(<PostListItem {...COMMUNITY_ANON_PROPS} readOnly />);
    pressByText('Chess Club');
    expectNoSideEffects();
  });

  it('readOnly anonymous post: never reveals the author identity', () => {
    render(
      <PostListItem
        {...BASE_PROPS}
        userId={null}
        username={null}
        isAnonymous
        readOnly
      />,
    );
    expect(screen.queryByText('author_user')).toBeNull();
    expect(screen.getByText('Nazarbayev')).toBeTruthy();
  });

  it('readOnly: "read more" still expands long text (local UI state only)', () => {
    const longContent = Array.from({ length: 6 }, (_, i) => `Line ${i + 1}`).join('\n');
    render(<PostListItem {...BASE_PROPS} content={longContent} readOnly />);
    pressByText('... read more');
    expect(screen.getByText('show less')).toBeTruthy();
    expectNoSideEffects();
  });

  it('readOnly detail-style props: bookmark button is never rendered', () => {
    const onBookmarkPress = jest.fn();
    render(
      <PostListItem
        {...BASE_PROPS}
        isDetailedPost
        onBookmarkPress={onBookmarkPress}
        readOnly
      />,
    );
    expect(screen.queryByText('icon:bookmark-outline')).toBeNull();
  });
});
