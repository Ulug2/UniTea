/**
 * Tests for src/app/(protected)/post/[id].tsx's handlePostComment() —
 * specifically the Phase 4 idempotency-id logic (lastCommentAttemptRef):
 * an unedited resubmission after a failed/ambiguous send reuses the same
 * id, while an actual edit of the draft generates a fresh one.
 *
 * Every auxiliary hook/component is mocked so these tests exercise exactly
 * handlePostComment()'s own orchestration logic, without depending on (or
 * re-testing) useCreateComment's own request-building (already covered by
 * useCreateComment.test.ts) or any other screen concern.
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

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
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

jest.mock('../../features/profile/hooks/useProfileById', () => ({
  useProfileById: () => ({
    data: { id: 'author-1', username: 'author_user' },
    isLoading: false,
    error: null,
  }),
}));

jest.mock('../../features/profile/hooks/useMyProfile', () => ({
  useMyProfile: () => ({
    data: { id: 'me', username: 'me', is_admin: false },
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

// Minimal, controllable stand-in for the real composer: a controlled text
// input wired to commentText/onChangeText, plus a pressable that calls the
// current onSubmit prop — enough to drive handlePostComment() end to end
// (type -> submit -> observe success/failure) without the real
// TextInput/Switch chrome.
jest.mock('../../features/comments/components/CommentComposer', () => {
  const React = require('react');
  const { Pressable, Text, TextInput } = require('react-native');
  return {
    CommentComposer: React.forwardRef((props: any, ref: any) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TextInput, {
          ref,
          testID: 'comment-text-input',
          value: props.commentText,
          onChangeText: props.onChangeText,
        }),
        React.createElement(
          Pressable,
          { testID: 'comment-send-button', onPress: props.onSubmit },
          React.createElement(Text, null, 'Send'),
        ),
      ),
    ),
  };
});

const mockCreateCommentMutateAsync = jest.fn();
let mockCreateCommentIsPending = false;

jest.mock('../../features/comments/hooks/useCreateComment', () => ({
  useCreateComment: () => ({
    isPending: mockCreateCommentIsPending,
    mutateAsync: mockCreateCommentMutateAsync,
  }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import PostDetailed from '../../app/(protected)/post/[id]';

function pressSend() {
  fireEvent.press(screen.getByTestId('comment-send-button'));
}

function typeComment(text: string) {
  fireEvent.changeText(screen.getByTestId('comment-text-input'), text);
}

describe('post/[id] comment idempotency id (Phase 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCommentIsPending = false;
  });

  it('does nothing when the comment text is empty', async () => {
    render(<PostDetailed />);
    pressSend();
    expect(mockCreateCommentMutateAsync).not.toHaveBeenCalled();
  });

  it('a comment submission includes a string id in the mutateAsync payload', async () => {
    mockCreateCommentMutateAsync.mockResolvedValue({ id: 'comment-1' });

    render(<PostDetailed />);
    typeComment('Great post!');
    await act(async () => {
      pressSend();
    });

    await waitFor(() => expect(mockCreateCommentMutateAsync).toHaveBeenCalledTimes(1));
    const sentId = mockCreateCommentMutateAsync.mock.calls[0][0].id;
    expect(typeof sentId).toBe('string');
    expect(sentId.length).toBeGreaterThan(0);
  });

  it('a normal successful submission clears the draft (unchanged existing behavior)', async () => {
    mockCreateCommentMutateAsync.mockResolvedValue({ id: 'comment-1' });

    render(<PostDetailed />);
    typeComment('Great post!');
    await act(async () => {
      pressSend();
    });

    await waitFor(() =>
      expect(screen.getByTestId('comment-text-input').props.value).toBe(''),
    );
  });

  it('retrying after a failed submission with unchanged content reuses the same id', async () => {
    mockCreateCommentMutateAsync.mockRejectedValueOnce(new Error('Network request failed'));
    mockCreateCommentMutateAsync.mockResolvedValueOnce({ id: 'comment-1' });

    render(<PostDetailed />);
    typeComment('Great post!');
    await act(async () => {
      pressSend();
    });
    await waitFor(() => expect(mockCreateCommentMutateAsync).toHaveBeenCalledTimes(1));

    // Draft preserved on failure (existing, unchanged behavior) — the same
    // text is still in the input, so pressing Send again is the normal
    // "just retry" recovery path, with no edit in between.
    expect(screen.getByTestId('comment-text-input').props.value).toBe('Great post!');

    await act(async () => {
      pressSend();
    });
    await waitFor(() => expect(mockCreateCommentMutateAsync).toHaveBeenCalledTimes(2));

    const firstId = mockCreateCommentMutateAsync.mock.calls[0][0].id;
    const secondId = mockCreateCommentMutateAsync.mock.calls[1][0].id;
    expect(secondId).toBe(firstId);
  });

  it('retrying after a failed submission with edited content generates a new id', async () => {
    mockCreateCommentMutateAsync.mockRejectedValueOnce(new Error('Network request failed'));
    mockCreateCommentMutateAsync.mockResolvedValueOnce({ id: 'comment-1' });

    render(<PostDetailed />);
    typeComment('Great post!');
    await act(async () => {
      pressSend();
    });
    await waitFor(() => expect(mockCreateCommentMutateAsync).toHaveBeenCalledTimes(1));

    // User edits the draft before resubmitting.
    typeComment('Great post, actually!');
    await act(async () => {
      pressSend();
    });
    await waitFor(() => expect(mockCreateCommentMutateAsync).toHaveBeenCalledTimes(2));

    const firstId = mockCreateCommentMutateAsync.mock.calls[0][0].id;
    const secondId = mockCreateCommentMutateAsync.mock.calls[1][0].id;
    expect(secondId).not.toBe(firstId);
  });

  it('a failed submission keeps the draft intact (existing behavior, unaffected by the id change)', async () => {
    mockCreateCommentMutateAsync.mockRejectedValue(new Error('Failed to post comment'));

    render(<PostDetailed />);
    typeComment('Great post!');
    await act(async () => {
      pressSend();
    });

    await waitFor(() => expect(mockCreateCommentMutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('comment-text-input').props.value).toBe('Great post!');
  });
});
