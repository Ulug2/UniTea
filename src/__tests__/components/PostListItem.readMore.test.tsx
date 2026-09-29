/**
 * PostListItem "read more": collapsed post text shows READ_MORE_MAX_LINES
 * (10) lines, and "read more" appears only when the text is longer.
 */
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: {
      push: (...args: unknown[]) => mockRouterPush(...args),
      replace: (...args: unknown[]) => mockRouterReplace(...args),
      back: (...args: unknown[]) => mockRouterBack(...args),
    },
    // asChild: just render the child as-is — outer-card navigation to Post
    // Detail isn't what this file tests.
    Link: ({ asChild, children }: any) =>
      asChild ? children : React.createElement(React.Fragment, null, children),
  };
});

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
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

let mockCurrentUserId: string | null = 'viewer-1';
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { get id() { return mockCurrentUserId; } } } }),
}));

jest.mock('../../hooks/useVote', () => ({
  useVote: () => ({
    userVote: null,
    score: 0,
    handleUpvote: jest.fn(),
    handleDownvote: jest.fn(),
  }),
}));

jest.mock('../../features/chat/hooks/useInitiateAnonymousChat', () => ({
  useInitiateAnonymousChat: () => ({ mutate: jest.fn(), isPending: false }),
}));

const mockQueryClient = { __fakeQueryClient: true };
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

const mockPrefetchCommunityDetail = jest.fn();
jest.mock('../../features/communities/data/communityDetailQuery', () => ({
  prefetchCommunityDetail: (...args: unknown[]) => mockPrefetchCommunityDetail(...args),
}));

jest.mock('../../features/posts/data/postDetailQuery', () => ({
  prefetchPostDetail: jest.fn(),
}));

jest.mock('../../components/Poll', () => () => null);

let capturedProfileModalProps: any = null;
jest.mock('../../components/UserProfileModal', () => (props: any) => {
  capturedProfileModalProps = props;
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
  isEdited: false,
  createdAt: new Date().toISOString(),
  username: 'author_user',
  avatarUrl: null,
  isVerified: false,
  universityDomain: 'nu.edu.kz',
  commentCount: 0,
  voteScore: 0,
  userVote: null,
  isAnonymous: false,
} as const;

const lineEvent = (count: number) => ({
  nativeEvent: { lines: Array.from({ length: count }, (_, i) => ({ text: `line ${i}` })) },
});

describe('PostListItem read more (10 lines)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('collapses post text to 10 lines', () => {
    const content = 'word '.repeat(60).trim();
    render(<PostListItem {...BASE_PROPS} content={content} />);
    expect(screen.getByText(content).props.numberOfLines).toBe(10);
  });

  it('shows no "read more" for short text', () => {
    render(<PostListItem {...BASE_PROPS} content="Short post" />);
    expect(screen.queryByText('... read more')).toBeNull();
  });

  it('shows "read more" for clearly long text without waiting for layout', () => {
    render(<PostListItem {...BASE_PROPS} content={'a '.repeat(300).trim()} />);
    expect(screen.getByText('... read more')).toBeTruthy();
  });

  it('shows "read more" for text with more than 10 lines of line breaks', () => {
    const content = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    render(<PostListItem {...BASE_PROPS} content={content} />);
    expect(screen.getByText('... read more')).toBeTruthy();
  });

  it('medium text: "read more" only when the measured layout exceeds 10 lines', () => {
    const content = 'medium '.repeat(45).trim(); // ~300 chars: measured, not guessed
    const { unmount } = render(<PostListItem {...BASE_PROPS} postId="m1" content={content} />);
    fireEvent(screen.getByText(content), 'textLayout', lineEvent(9));
    expect(screen.queryByText('... read more')).toBeNull();
    unmount();

    render(<PostListItem {...BASE_PROPS} postId="m2" content={content} />);
    fireEvent(screen.getByText(content), 'textLayout', lineEvent(12));
    expect(screen.getByText('... read more')).toBeTruthy();
  });

  it('expands to the full text and back', () => {
    const content = 'b '.repeat(300).trim();
    render(<PostListItem {...BASE_PROPS} content={content} />);
    fireEvent.press(screen.getByText('... read more'), { preventDefault: jest.fn(), stopPropagation: jest.fn() });
    expect(screen.getByText(content).props.numberOfLines).toBeUndefined();
    expect(screen.getByText('show less')).toBeTruthy();
  });
});
