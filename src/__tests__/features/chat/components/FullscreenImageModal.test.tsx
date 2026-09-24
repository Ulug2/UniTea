/**
 * Tests for the chat full-screen image wrapper
 * (src/features/chat/components/FullscreenImageModal.tsx): signed-URL
 * resolution, stable cache key shared with the chat bubble, and retry after
 * a signing failure.
 */
const mockShared = jest.fn();
jest.mock('../../../../components/FullscreenImageModal', () => ({
  FullscreenImageModal: (props: unknown) => {
    mockShared(props);
    return null;
  },
}));
jest.mock('../../../../utils/signedStorageUrl', () => ({
  getSignedStorageUrl: jest.fn(),
  storageImageCacheKey: (bucket: string, path: string) => `${bucket}/${path}`,
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { FullscreenImageModal } from '../../../../features/chat/components/FullscreenImageModal';
import { getSignedStorageUrl } from '../../../../utils/signedStorageUrl';

const mockSign = getSignedStorageUrl as jest.Mock;

type SharedProps = {
  uri: string | null;
  cacheKey?: string;
  isResolving: boolean;
  resolveFailed: boolean;
  onRetry: () => void;
};
const lastProps = (): SharedProps => mockShared.mock.calls[mockShared.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  mockSign.mockImplementation(async (_bucket: string, path: string) => `https://signed/${path}`);
});

it('shows a spinner while signing, then the signed URL with a stable cache key', async () => {
  render(<FullscreenImageModal visible imagePath="chat/1.webp" onClose={jest.fn()} />);

  expect(lastProps().isResolving).toBe(true);
  await waitFor(() => expect(lastProps().uri).toBe('https://signed/chat/1.webp'));
  expect(mockSign).toHaveBeenCalledWith('chat-images', 'chat/1.webp');
  expect(lastProps().cacheKey).toBe('chat-images/chat/1.webp');
  expect(lastProps().isResolving).toBe(false);
});

it('reports a signing failure and re-signs on retry', async () => {
  mockSign.mockRejectedValueOnce(new Error('denied'));
  render(<FullscreenImageModal visible imagePath="chat/3.webp" onClose={jest.fn()} />);

  await waitFor(() => expect(lastProps().resolveFailed).toBe(true));
  expect(lastProps().isResolving).toBe(false);

  act(() => {
    lastProps().onRetry();
  });
  await waitFor(() => expect(lastProps().uri).toBe('https://signed/chat/3.webp'));
  expect(lastProps().resolveFailed).toBe(false);
  expect(mockSign).toHaveBeenCalledTimes(2);
});

it('does not sign anything while hidden', () => {
  render(<FullscreenImageModal visible={false} imagePath="chat/4.webp" onClose={jest.fn()} />);
  expect(mockSign).not.toHaveBeenCalled();
  expect(lastProps().isResolving).toBe(false);
});
