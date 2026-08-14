/**
 * Phase 3.1A UX refinement: PostListItem's header avatar/name Pressable
 * must navigate to Community View when it's showing a COMMUNITY's identity
 * (anonymous post within a community — see resolvePostAuthorDisplay /
 * resolveAnonymousEntityKind in entityDisplay.ts), while every other case
 * (normal author, anonymous non-community post) keeps its exact prior
 * behavior. This is the only place a community's avatar/name is rendered
 * in the regular feed — PostHeaderCard (Post Detail) is a thin wrapper
 * around this same component, so this coverage protects both surfaces.
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
    isVoting: false,
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
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
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
} as const;

function pressIdentity(displayName: string) {
  const nameText = screen.getByText(displayName);
  // PostListItem's handlers call e.preventDefault()/e.stopPropagation()
  // (guarding against the outer card's own Link/Pressable) — a bare press
  // with no event payload leaves those undefined.
  fireEvent.press(nameText.parent!, {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  });
}

describe('PostListItem header identity navigation (Phase 3.1A UX refinement)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUserId = 'viewer-1';
    capturedProfileModalProps = null;
  });

  it('anonymous community post: prefetches and navigates to Community View on tap', async () => {
    render(
      <PostListItem
        {...BASE_PROPS}
        isAnonymous
        communityId="community-42"
        communityName="Chess Club"
        communityAvatarUrl={null}
      />,
    );
    pressIdentity('Chess Club');
    await waitFor(() => {
      expect(mockPrefetchCommunityDetail).toHaveBeenCalledWith(mockQueryClient, 'community-42');
      expect(mockRouterPush).toHaveBeenCalledWith('/communities/community-42');
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
    // Confirms push, not replace, preserves the normal back stack.
    expect(capturedProfileModalProps).toBeNull();
  });

  it('anonymous community post with disableCommunityNavigation: tapping does nothing (already inside that Community View)', () => {
    render(
      <PostListItem
        {...BASE_PROPS}
        isAnonymous
        communityId="community-42"
        communityName="Chess Club"
        communityAvatarUrl={null}
        disableCommunityNavigation
      />,
    );
    pressIdentity('Chess Club');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalled();
    expect(capturedProfileModalProps).toBeNull();
  });

  it('normal non-anonymous post: existing profile-press behavior is unchanged', async () => {
    render(
      <PostListItem
        {...BASE_PROPS}
        isAnonymous={false}
        communityId={null}
        communityName={null}
        communityAvatarUrl={null}
      />,
    );
    pressIdentity('author_user');
    await waitFor(() => {
      expect(capturedProfileModalProps).toMatchObject({
        userId: 'author-1',
        visible: true,
      });
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalled();
  });

  it('anonymous non-community post: header identity remains non-navigable', () => {
    render(
      <PostListItem
        {...BASE_PROPS}
        isAnonymous
        universityDomain="nonexistent.example.com"
        communityId={null}
        communityName={null}
        communityAvatarUrl={null}
      />,
    );
    // Anonymous + no community -> falls back to the university identity
    // label (getDisplayNameForEntity's "university" branch: no branding
    // match -> literal "University"), not the author's real username.
    expect(screen.queryByText('author_user')).toBeNull();
    pressIdentity('University');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockPrefetchCommunityDetail).not.toHaveBeenCalled();
    expect(capturedProfileModalProps).toBeNull();
  });

  it('tapping own post (isOwnPost) still does not open the profile modal', () => {
    render(
      <PostListItem
        {...BASE_PROPS}
        userId="viewer-1"
        isAnonymous={false}
        communityId={null}
        communityName={null}
        communityAvatarUrl={null}
      />,
    );
    pressIdentity('author_user');
    expect(capturedProfileModalProps).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
