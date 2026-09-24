/**
 * Render-level tests for SupabaseImage on the private chat-images bucket:
 * the signed URL comes from the shared resolver, expo-image gets a stable
 * cacheKey (so signed-token changes don't defeat the disk cache).
 */
const mockImage = jest.fn();
jest.mock('expo-image', () => ({
  Image: (props: unknown) => {
    mockImage(props);
    return null;
  },
}));
jest.mock('../../lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));
jest.mock('../../utils/signedStorageUrl', () => ({
  getCachedSignedUrl: jest.fn(() => null),
  getSignedStorageUrl: jest.fn(),
  storageImageCacheKey: (bucket: string, path: string) => `${bucket}/${path}`,
}));

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import SupabaseImage from '../../components/SupabaseImage';
import { getSignedStorageUrl } from '../../utils/signedStorageUrl';

const mockSign = getSignedStorageUrl as jest.Mock;
type ImageProps = { source: { uri?: string; cacheKey?: string }; onError: () => void };
const lastImage = (): ImageProps => mockImage.mock.calls[mockImage.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  mockSign.mockImplementation(async (_b: string, path: string) => `https://signed/${path}`);
});

it('renders the signed URL with a path-based cache key', async () => {
  render(<SupabaseImage bucket="chat-images" path="chat/1.webp" />);

  await waitFor(() => expect(mockImage).toHaveBeenCalled());
  expect(mockSign).toHaveBeenCalledWith('chat-images', 'chat/1.webp');
  expect(lastImage().source).toEqual({
    uri: 'https://signed/chat/1.webp',
    cacheKey: 'chat-images/chat/1.webp',
  });
});

it('reports a load error to the caller', async () => {
  const onError = jest.fn();
  render(<SupabaseImage bucket="chat-images" path="chat/2.webp" onError={onError} />);
  await waitFor(() => expect(mockImage).toHaveBeenCalled());

  act(() => lastImage().onError());
  expect(onError).toHaveBeenCalledTimes(1);
});

it('keeps public buckets on plain public URLs with no cache key', async () => {
  render(<SupabaseImage bucket="post-images" path="p/1.webp" />);
  await waitFor(() => expect(mockImage).toHaveBeenCalled());
  expect(mockSign).not.toHaveBeenCalled();
  expect(lastImage().source.cacheKey).toBeUndefined();
  expect(lastImage().source.uri).toContain('/storage/v1/object/public/post-images/p/1.webp');
});
