/**
 * CommentListItem while an optimistic comment is still being created:
 * shows "Posting…" and hides Reply, votes and the menu (all of which need
 * the comment to exist server-side).
 */
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: { card: '#fff', text: '#000', secondaryText: '#666', primary: '#2FC9C1', background: '#fff', border: '#eee' },
    isDark: false,
  }),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('../../hooks/useVote', () => ({
  useVote: () => ({ userVote: null, score: 0, handleUpvote: jest.fn(), handleDownvote: jest.fn() }),
}));
jest.mock('../../features/comments/hooks/useDeleteComment', () => ({
  useDeleteComment: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../features/posts/hooks/useBlockUser', () => ({
  useBlockUser: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../hooks/useBlocks', () => ({
  useBlocks: () => ({ data: [] }),
  hasBlockForScope: () => false,
}));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../components/EntityAvatar', () => () => null);
jest.mock('../../components/ReportModal', () => () => null);
jest.mock('../../components/UserProfileModal', () => () => null);

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import CommentListItem from '../../components/CommentListItem';

const baseComment = {
  id: 'c1',
  post_id: 'p1',
  user_id: 'me',
  content: 'hello there',
  parent_comment_id: null,
  is_anonymous: false,
  is_deleted: false,
  created_at: new Date().toISOString(),
  updated_at: null,
  post_specific_anon_id: null,
  user: { id: 'me', username: 'BlueFalcon482' } as any,
  score: 0,
  user_vote: null,
  replies: [],
};

const renderItem = (comment: any) =>
  render(
    <CommentListItem
      comment={comment}
      depth={0}
      handleReplyPress={jest.fn()}
      postAuthorContext={{ isAnonymous: false, isOwnPost: false } as any}
    />,
  );

it('shows "Posting…" and no Reply action while pending', () => {
  renderItem({ ...baseComment, _pending: true });
  expect(screen.getByText('hello there')).toBeTruthy();
  expect(screen.getByText('Posting…')).toBeTruthy();
  expect(screen.queryByText('Reply')).toBeNull();
});

it('shows the normal actions once confirmed', () => {
  renderItem({ ...baseComment, _pending: false });
  expect(screen.getByText('Reply')).toBeTruthy();
  expect(screen.queryByText('Posting…')).toBeNull();
});
