/**
 * Web post card preview screen + route: fixtures only in __DEV__, live posts
 * only for signed-in viewers (signed-out viewers are handed to the normal
 * sign-in screen and brought back), the card is always the real
 * PostListItem in readOnly mode, and native builds never show the page.
 */
const mockRouterReplace = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    router: { replace: (...args: unknown[]) => mockRouterReplace(...args) },
    useLocalSearchParams: () => mockParams,
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `redirect:${href}`),
  };
});
jest.mock('expo-router/head', () => () => null);

let mockSession: { user: { id: string } } | null = null;
let mockAuthLoading = false;
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ session: mockSession, loading: mockAuthLoading }),
}));

const mockUsePreviewPost = jest.fn();
jest.mock('../../../features/preview/hooks/usePreviewPost', () => ({
  usePreviewPost: (...args: unknown[]) => mockUsePreviewPost(...args),
}));

const mockSetPendingDeepLink = jest.fn();
jest.mock('../../../utils/pendingDeepLink', () => ({
  setPendingDeepLink: (...args: unknown[]) => mockSetPendingDeepLink(...args),
}));

const mockPostListItem = jest.fn();
jest.mock('../../../components/PostListItem', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return (props: { content: string }) => {
    mockPostListItem(props);
    return React.createElement(Text, null, props.content);
  };
});

import React from 'react';
import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import PostCardPreviewScreen from '../../../features/preview/components/PostCardPreviewScreen';
import PostCardPreviewRoute from '../../../app/preview/post-card';
import { getPreviewFixture } from '../../../features/preview/data/fixtures';

const LIVE_ID = '11111111-2222-4333-8444-555555555555';
const originalDev = (global as any).__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockSession = null;
  mockAuthLoading = false;
  mockUsePreviewPost.mockReturnValue({ status: 'invalid' });
  (global as any).__DEV__ = true;
});

afterAll(() => {
  (global as any).__DEV__ = originalDev;
});

describe('PostCardPreviewScreen', () => {
  it('__DEV__ fixture: renders the read-only card and the wordmark without a session or live fetch', () => {
    mockParams = { fixture: 'text' };
    render(<PostCardPreviewScreen />);

    expect(screen.getByTestId('preview-card')).toBeTruthy();
    expect(screen.getByTestId('unitee-wordmark')).toBeTruthy();
    expect(mockPostListItem).toHaveBeenCalledWith(
      expect.objectContaining({ postId: getPreviewFixture('text')!.post_id, readOnly: true }),
    );
    expect(mockUsePreviewPost).toHaveBeenCalledWith(null, undefined);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('production build: fixtures are ignored', () => {
    (global as any).__DEV__ = false;
    mockParams = { fixture: 'text' };
    render(<PostCardPreviewScreen />);

    expect(screen.queryByTestId('preview-card')).toBeNull();
    expect(mockPostListItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('preview-message')).toBeTruthy();
  });

  it('signed out + live post id: hands off to sign-in and returns to this preview', () => {
    mockParams = { postId: LIVE_ID };
    mockUsePreviewPost.mockReturnValue({ status: 'signed-out' });
    render(<PostCardPreviewScreen />);

    expect(mockSetPendingDeepLink).toHaveBeenCalledWith(`/preview/post-card?postId=${LIVE_ID}`);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)');
    expect(mockPostListItem).not.toHaveBeenCalled();
  });

  it('does not redirect while auth is still loading', () => {
    mockParams = { postId: LIVE_ID };
    mockAuthLoading = true;
    mockUsePreviewPost.mockReturnValue({ status: 'signed-out' });
    render(<PostCardPreviewScreen />);

    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('preview-loading')).toBeTruthy();
  });

  it('signed in + ready: renders the live post read-only, scoped to the viewer', () => {
    const post = { ...getPreviewFixture('text')!, post_id: LIVE_ID, content: 'Live content' };
    mockParams = { postId: LIVE_ID };
    mockSession = { user: { id: 'viewer-1' } };
    mockUsePreviewPost.mockReturnValue({ status: 'ready', post });
    render(<PostCardPreviewScreen />);

    expect(mockUsePreviewPost).toHaveBeenCalledWith(LIVE_ID, 'viewer-1');
    expect(screen.getByText('Live content')).toBeTruthy();
    expect(mockPostListItem).toHaveBeenCalledWith(
      expect.objectContaining({ postId: LIVE_ID, readOnly: true }),
    );
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'error', 'invalid'] as const)(
    '%s: shows a message instead of a card',
    (status) => {
      mockParams = { postId: LIVE_ID };
      mockSession = { user: { id: 'viewer-1' } };
      mockUsePreviewPost.mockReturnValue({ status });
      render(<PostCardPreviewScreen />);

      expect(screen.getByTestId('preview-message')).toBeTruthy();
      expect(mockPostListItem).not.toHaveBeenCalled();
    },
  );
});

describe('preview/post-card route', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it.each(['ios', 'android'])('%s: redirects home and never renders the preview', (os) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    mockParams = { fixture: 'text' };
    render(<PostCardPreviewRoute />);

    expect(screen.getByText('redirect:/')).toBeTruthy();
    expect(screen.queryByTestId('preview-card')).toBeNull();
    expect(mockUsePreviewPost).not.toHaveBeenCalled();
  });

  it('web: renders the preview', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    mockParams = { fixture: 'text' };
    render(<PostCardPreviewRoute />);

    expect(screen.getByTestId('preview-card')).toBeTruthy();
  });
});
