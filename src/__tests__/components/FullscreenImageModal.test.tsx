/**
 * Tests for the shared full-screen image gallery
 * (src/components/FullscreenImageModal.tsx): one page per image, page
 * counter, per-page loading/error/retry, and the cache key hand-off.
 */
const mockImage = jest.fn();
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return {
    Image: (props: any) => {
      mockImage(props);
      return <View testID="gallery-image" />;
    },
  };
});
jest.mock('../../components/PinchToZoom', () => ({
  PinchToZoom: ({ children }: { children: React.ReactNode }) => children,
}));

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FullscreenImageModal } from '../../components/FullscreenImageModal';

const imageProps = () => mockImage.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders one page per image with its cache key', () => {
  render(
    <FullscreenImageModal
      visible
      images={[
        { uri: 'https://x/1', cacheKey: 'k1' },
        { uri: 'https://x/2', cacheKey: 'k2' },
      ]}
      onClose={jest.fn()}
    />,
  );

  expect(imageProps().map((p) => p.source)).toEqual([
    { uri: 'https://x/1', cacheKey: 'k1' },
    { uri: 'https://x/2', cacheKey: 'k2' },
  ]);
  expect(screen.getByText('1 / 2')).toBeTruthy();
});

it('starts on the tapped image', () => {
  render(
    <FullscreenImageModal
      visible
      images={[{ uri: 'https://x/1' }, { uri: 'https://x/2' }, { uri: 'https://x/3' }]}
      initialIndex={2}
      onClose={jest.fn()}
    />,
  );
  expect(screen.getByText('3 / 3')).toBeTruthy();
  expect(imageProps().map((p) => p.source.uri)).toContain('https://x/3');
});

it('shows no counter for a single image', () => {
  render(<FullscreenImageModal visible images={[{ uri: 'https://x/1' }]} onClose={jest.fn()} />);
  expect(screen.queryByText('1 / 1')).toBeNull();
});

it('shows the error state when an image fails to load, and reloads it on Retry', () => {
  const onRetry = jest.fn();
  render(<FullscreenImageModal visible images={[{ uri: 'https://x/1' }]} onRetry={onRetry} onClose={jest.fn()} />);

  act(() => {
    imageProps()[0].onError();
  });
  expect(screen.getByText("Couldn't load image")).toBeTruthy();
  expect(screen.queryByTestId('gallery-image')).toBeNull();

  fireEvent.press(screen.getByText('Retry'));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Couldn't load image")).toBeNull();
  expect(screen.getByTestId('gallery-image')).toBeTruthy();
});

it('shows the error state for a page whose URI could not be resolved', () => {
  render(
    <FullscreenImageModal visible images={[{ uri: null }]} resolveFailed onClose={jest.fn()} />,
  );
  expect(screen.getByText("Couldn't load image")).toBeTruthy();
});

it('renders nothing but the chrome while hidden', () => {
  render(<FullscreenImageModal visible={false} images={[{ uri: 'https://x/1' }]} onClose={jest.fn()} />);
  expect(mockImage).not.toHaveBeenCalled();
});
