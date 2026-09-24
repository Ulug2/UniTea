/**
 * Tests for the chat full-screen gallery wrapper
 * (src/features/chat/components/FullscreenImageModal.tsx): per-image signed
 * URL resolution, stable cache keys shared with the chat bubble, and retry
 * after a signing failure.
 */
const mockShared = jest.fn();
jest.mock('../../../../components/FullscreenImageModal', () => ({
  FullscreenImageModal: (props: unknown) => {
    mockShared(props);
    return null;
  },
}));
jest.mock('../../../../utils/signedStorageUrl', () => ({
  getCachedSignedUrl: jest.fn(() => null),
  getSignedStorageUrl: jest.fn(),
  storageImageCacheKey: (bucket: string, path: string) => `${bucket}/${path}`,
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { FullscreenImageModal } from '../../../../features/chat/components/FullscreenImageModal';
import { getCachedSignedUrl, getSignedStorageUrl } from '../../../../utils/signedStorageUrl';

const mockSign = getSignedStorageUrl as jest.Mock;
const mockCached = getCachedSignedUrl as jest.Mock;

type SharedProps = {
  images: Array<{ uri: string | null; cacheKey?: string }>;
  initialIndex: number;
  resolveFailed: boolean;
  onRetry: () => void;
};
const lastProps = (): SharedProps => mockShared.mock.calls[mockShared.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  mockCached.mockReturnValue(null);
  mockSign.mockImplementation(async (_bucket: string, path: string) => `https://signed/${path}`);
});

it('resolves every image and keeps order, cache keys and the tapped index', async () => {
  render(
    <FullscreenImageModal
      visible
      imagePaths={['c/1.webp', 'c/2.webp', 'c/3.webp']}
      initialIndex={2}
      onClose={jest.fn()}
    />,
  );

  expect(lastProps().images.map((i) => i.uri)).toEqual([null, null, null]);
  await waitFor(() =>
    expect(lastProps().images.map((i) => i.uri)).toEqual([
      'https://signed/c/1.webp',
      'https://signed/c/2.webp',
      'https://signed/c/3.webp',
    ]),
  );
  expect(lastProps().images.map((i) => i.cacheKey)).toEqual([
    'chat-images/c/1.webp',
    'chat-images/c/2.webp',
    'chat-images/c/3.webp',
  ]);
  expect(lastProps().initialIndex).toBe(2);
});

it('uses already-cached signed URLs immediately without signing again', () => {
  mockCached.mockImplementation((_b: string, path: string) => `https://cached/${path}`);
  render(<FullscreenImageModal visible imagePaths={['c/4.webp']} initialIndex={0} onClose={jest.fn()} />);

  expect(lastProps().images[0].uri).toBe('https://cached/c/4.webp');
  expect(mockSign).not.toHaveBeenCalled();
});

it('shows the other images when one fails to sign, and re-signs on retry', async () => {
  mockSign.mockImplementation(async (_b: string, path: string) => {
    if (path === 'c/6.webp' && mockSign.mock.calls.filter((c) => c[1] === path).length === 1) {
      throw new Error('denied');
    }
    return `https://signed/${path}`;
  });
  render(
    <FullscreenImageModal visible imagePaths={['c/5.webp', 'c/6.webp']} initialIndex={0} onClose={jest.fn()} />,
  );

  await waitFor(() => expect(lastProps().resolveFailed).toBe(true));
  expect(lastProps().images[0].uri).toBe('https://signed/c/5.webp');
  expect(lastProps().images[1].uri).toBeNull();

  act(() => {
    lastProps().onRetry();
  });
  await waitFor(() => expect(lastProps().images[1].uri).toBe('https://signed/c/6.webp'));
  expect(lastProps().resolveFailed).toBe(false);
});

it('does not sign anything while hidden', () => {
  render(<FullscreenImageModal visible={false} imagePaths={['c/7.webp']} initialIndex={0} onClose={jest.fn()} />);
  expect(mockSign).not.toHaveBeenCalled();
});
