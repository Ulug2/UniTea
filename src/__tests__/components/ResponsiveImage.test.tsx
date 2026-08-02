/**
 * Tests for src/components/ResponsiveImage.tsx — specifically that
 * mode="chatBubble" upgrades to a memory-persisting cache policy (fixes the
 * chat image reload flash on remount) while every other mode keeps the
 * existing disk-only policy unchanged.
 */
const mockExpoImage = jest.fn((_props: any) => null);
jest.mock('expo-image', () => ({
  Image: (props: any) => mockExpoImage(props),
}));

const mockSupabaseImage = jest.fn((_props: any) => null);
jest.mock('../../components/SupabaseImage', () => (props: any) => mockSupabaseImage(props));

import React from 'react';
import { render } from '@testing-library/react-native';
import ResponsiveImage from '../../components/ResponsiveImage';

beforeEach(() => {
  mockExpoImage.mockClear();
  mockSupabaseImage.mockClear();
});

describe('ResponsiveImage cachePolicy', () => {
  it('chatBubble mode + a Supabase storage path: passes cachePolicy="memory-disk" to SupabaseImage', () => {
    render(
      <ResponsiveImage
        source="u1/some-image.webp"
        bucket="chat-images"
        mode="chatBubble"
        knownAspectRatio={1.5}
      />,
    );

    expect(mockSupabaseImage).toHaveBeenCalledWith(
      expect.objectContaining({ cachePolicy: 'memory-disk' }),
    );
  });

  it('chatBubble mode + a direct URI: passes cachePolicy="memory-disk" to the raw ExpoImage', () => {
    render(
      <ResponsiveImage
        source="https://storage.example.com/chat-images/photo.jpg"
        mode="chatBubble"
        knownAspectRatio={1.5}
      />,
    );

    expect(mockExpoImage).toHaveBeenCalledWith(
      expect.objectContaining({ cachePolicy: 'memory-disk' }),
    );
  });

  it('single mode (feed post): still passes cachePolicy="disk", unchanged', () => {
    render(
      <ResponsiveImage
        source="u1/post-image.webp"
        bucket="post-images"
        mode="single"
        knownAspectRatio={1.5}
      />,
    );

    expect(mockSupabaseImage).toHaveBeenCalledWith(
      expect.objectContaining({ cachePolicy: 'disk' }),
    );
  });

  it('galleryPreview mode: still passes cachePolicy="disk", unchanged', () => {
    render(
      <ResponsiveImage
        source="u1/post-image.webp"
        bucket="post-images"
        mode="galleryPreview"
        knownAspectRatio={1.5}
      />,
    );

    expect(mockSupabaseImage).toHaveBeenCalledWith(
      expect.objectContaining({ cachePolicy: 'disk' }),
    );
  });
});

describe('ResponsiveImage version pass-through (Phase 6 cache versioning)', () => {
  it('forwards the version prop to SupabaseImage when supplied', () => {
    render(
      <ResponsiveImage
        source="community-1/avatar.webp"
        bucket="post-images"
        mode="single"
        knownAspectRatio={1}
        version="2026-08-02T12:00:00Z"
      />,
    );

    expect(mockSupabaseImage).toHaveBeenCalledWith(
      expect.objectContaining({ version: '2026-08-02T12:00:00Z' }),
    );
  });

  it('passes version=undefined through when omitted (no behavior change for existing callers)', () => {
    render(
      <ResponsiveImage source="u1/post-image.webp" bucket="post-images" mode="single" knownAspectRatio={1} />,
    );

    expect(mockSupabaseImage).toHaveBeenCalledWith(
      expect.objectContaining({ version: undefined }),
    );
  });
});
