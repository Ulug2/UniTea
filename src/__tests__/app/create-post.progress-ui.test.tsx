/**
 * Tests for the submission progress UI added to
 * src/app/(protected)/create-post.tsx (Phase 7.5) — real, honest phase
 * labels (preparing_images / uploading_images / publishing), driven by
 * actual completion signals rather than fake timers/percentages.
 *
 * Mocking setup mirrors create-post.draft-preservation.test.tsx exactly,
 * so these tests exercise the same real handlePost()/pickImage()
 * orchestration, just asserting on the new progress-area text instead of
 * navigation/reset behavior (already covered there).
 */
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
    replace: (...args: unknown[]) => mockRouterReplace(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
  useLocalSearchParams: () => ({}),
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

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));

const mockUploadImage = jest.fn();
jest.mock('../../utils/supabaseImages', () => ({
  uploadImage: (...args: unknown[]) => mockUploadImage(...args),
}));

jest.mock('../../components/EntityAvatar', () => () => null);
jest.mock('../../components/CharacterCounter', () => () => null);

jest.mock('../../features/communities/hooks/useCommunity', () => ({
  useCommunity: () => ({ data: undefined }),
}));

jest.mock('../../hooks/useResolvedAuthorProfile', () => ({
  useResolvedAuthorProfile: () => ({
    profile: {
      username: 'me',
      avatar_url: null,
      university_id: 'uni-1',
      is_admin: false,
    },
    universityDomain: 'uni.edu',
  }),
}));

jest.mock('../../hooks/useOriginalPostForRepost', () => ({
  useOriginalPostForRepost: () => ({ originalPost: null, isLoadingOriginal: false }),
}));

const mockPickAndPrepareImages = jest.fn();
jest.mock('../../hooks/useImagePipeline', () => ({
  useImagePipeline: () => ({ pickAndPrepareImages: mockPickAndPrepareImages }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: jest.fn() }),
}));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../components/FullscreenImageModal', () => ({
  FullscreenImageModal: () => null,
  resolvePostImageUri: (u: string) => u,
}));

const mockSetImages = jest.fn();
const mockReset = jest.fn();

type FormStateOverrides = Partial<{
  isLostFound: boolean;
  isRepost: boolean;
  content: string;
  images: string[];
  isAnonymous: boolean;
  isSubmitting: boolean;
  isPoll: boolean;
  pollOptions: string[];
  category: 'lost' | 'found';
  location: string;
  title: string;
  canSubmit: boolean;
}>;

let mockFormStateOverrides: FormStateOverrides = {};

function mockBaseFormState() {
  return {
    isLostFound: false,
    isRepost: false,
    content: 'Hello world',
    setContent: jest.fn(),
    images: [] as string[],
    setImages: mockSetImages,
    isAnonymous: true,
    setIsAnonymous: jest.fn(),
    isSubmitting: false,
    setIsSubmitting: jest.fn(),
    isPoll: false,
    setIsPoll: jest.fn(),
    pollOptions: ['', ''],
    setPollOptions: jest.fn(),
    category: 'lost' as const,
    setCategory: jest.fn(),
    location: '',
    setLocation: jest.fn(),
    title: '',
    setTitle: jest.fn(),
    reset: mockReset,
    canSubmit: true,
    ...mockFormStateOverrides,
  };
}

jest.mock('../../hooks/useCreatePostFormState', () => ({
  useCreatePostFormState: () => mockBaseFormState(),
}));

const mockMutateAsync = jest.fn();
let mockMutationIsPending = false;

jest.mock('../../hooks/useCreatePostMutation', () => ({
  useCreatePostMutation: () => ({
    isPending: mockMutationIsPending,
    mutateAsync: mockMutateAsync,
  }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CreatePostScreen from '../../app/(protected)/create-post';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFormStateOverrides = {};
  mockMutationIsPending = false;
  mockPickAndPrepareImages.mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

function pressPost() {
  fireEvent.press(screen.getByTestId('create-post-submit-button'));
}

function pressImagePicker() {
  fireEvent.press(screen.getByTestId('create-post-image-picker-button'));
}

describe('create-post submission progress UI (Phase 7.5)', () => {
  it('no progress area is rendered while idle', () => {
    render(<CreatePostScreen />);
    expect(screen.queryByText('Publishing post...')).toBeNull();
    expect(screen.queryByText(/Uploading images/)).toBeNull();
    expect(screen.queryByText('Preparing images...')).toBeNull();
  });

  it('shows "Preparing images..." while the picker is processing, and hides it once done', async () => {
    const { promise, resolve } = deferred<Array<{ uri: string; aspectRatio: number }>>();
    mockPickAndPrepareImages.mockReturnValue(promise);

    render(<CreatePostScreen />);
    pressImagePicker();

    await waitFor(() =>
      expect(screen.getByText('Preparing images...')).toBeTruthy(),
    );
    // Publishing/uploading text must never appear during this phase.
    expect(screen.queryByText(/Uploading images/)).toBeNull();
    expect(screen.queryByText('Publishing post...')).toBeNull();

    await act(async () => {
      resolve([]);
      await promise;
    });

    await waitFor(() =>
      expect(screen.queryByText('Preparing images...')).toBeNull(),
    );
  });

  it('shows real, incrementing "Uploading images (n/total)" progress as each image upload actually completes', async () => {
    mockFormStateOverrides = {
      images: ['file:///a.jpg', 'file:///b.jpg'],
    };
    const first = deferred<string>();
    const second = deferred<string>();
    mockUploadImage
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mockMutateAsync.mockReturnValue(new Promise(() => {})); // never resolves in this test

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockUploadImage).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText('Uploading images (0/2)')).toBeTruthy(),
    );

    await act(async () => {
      first.resolve('me/post-1/0.jpg');
      await first.promise;
    });
    await waitFor(() =>
      expect(screen.getByText('Uploading images (1/2)')).toBeTruthy(),
    );

    await act(async () => {
      second.resolve('me/post-1/1.jpg');
      await second.promise;
    });

    // Once both uploads complete, the flow moves on to publishing.
    await waitFor(() =>
      expect(screen.getByText('Publishing post...')).toBeTruthy(),
    );
    expect(screen.queryByText(/Uploading images/)).toBeNull();
  });

  it('goes straight to "Publishing post..." with no upload phase when there are no images', async () => {
    mockMutateAsync.mockReturnValue(new Promise(() => {})); // never resolves in this test

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() =>
      expect(screen.getByText('Publishing post...')).toBeTruthy(),
    );
    expect(screen.queryByText(/Uploading images/)).toBeNull();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it('clears the progress area once the submission succeeds', async () => {
    const { promise, resolve } = deferred<{ id: string }>();
    mockMutateAsync.mockReturnValue(promise);

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() =>
      expect(screen.getByText('Publishing post...')).toBeTruthy(),
    );

    await act(async () => {
      resolve({ id: 'post-1' });
      await promise;
    });

    await waitFor(() =>
      expect(screen.queryByText('Publishing post...')).toBeNull(),
    );
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('clears the progress area (does not get stuck) when the submission fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Failed to create post'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() =>
      expect(screen.getByText('Publishing post...')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.queryByText('Publishing post...')).toBeNull(),
    );
    // Draft-preservation behavior (already covered elsewhere) is unaffected:
    // no reset/navigation on failure.
    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('an image upload failure clears the progress area without ever reaching the publishing phase', async () => {
    mockFormStateOverrides = { images: ['file:///a.jpg'] };
    mockUploadImage.mockRejectedValue(new Error('Failed to upload image. Please try again.'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() =>
      expect(screen.getByText('Uploading images (0/1)')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.queryByText('Uploading images (0/1)')).toBeNull(),
    );
    expect(screen.queryByText('Publishing post...')).toBeNull();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('regression: Lost & Found post submission still works end-to-end with the new progress states present', async () => {
    mockFormStateOverrides = {
      isLostFound: true,
      title: 'Lost wallet',
      location: 'Library',
      content: 'Black leather wallet',
    };
    mockMutateAsync.mockResolvedValue({ id: 'post-1' });

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockReset).toHaveBeenCalledTimes(1));
    expect(mockRouterReplace).toHaveBeenCalledWith('/(protected)/(tabs)/lostfound');
  });
});
