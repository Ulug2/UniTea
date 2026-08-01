/**
 * Tests for src/app/(protected)/create-post.tsx's handlePost() control flow —
 * specifically that a failed submission (network, server, moderation,
 * rate-limit, or any other mutation failure) never resets the draft or
 * navigates away, and that only a confirmed successful creation does.
 *
 * Every auxiliary hook is mocked so these tests exercise exactly
 * handlePost()'s own orchestration logic (validation -> image upload ->
 * mutateAsync -> reset/navigate) without depending on, or re-testing,
 * useCreatePostMutation's optimistic-cache internals (already covered by
 * useCreatePostMutation.test.ts) or useCreatePostFormState's own state
 * management (already covered by useCreatePostFormState.test.ts).
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

jest.mock('../../hooks/useImagePipeline', () => ({
  useImagePipeline: () => ({ pickAndPrepareImages: jest.fn() }),
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

const mockSetContent = jest.fn();
const mockSetImages = jest.fn();
const mockSetIsAnonymous = jest.fn();
const mockSetIsSubmitting = jest.fn();
const mockSetIsPoll = jest.fn();
const mockSetPollOptions = jest.fn();
const mockSetCategory = jest.fn();
const mockSetLocation = jest.fn();
const mockSetTitle = jest.fn();
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
    setContent: mockSetContent,
    images: [] as string[],
    setImages: mockSetImages,
    isAnonymous: true,
    setIsAnonymous: mockSetIsAnonymous,
    isSubmitting: false,
    setIsSubmitting: mockSetIsSubmitting,
    isPoll: false,
    setIsPoll: mockSetIsPoll,
    pollOptions: ['', ''],
    setPollOptions: mockSetPollOptions,
    category: 'lost' as const,
    setCategory: mockSetCategory,
    location: '',
    setLocation: mockSetLocation,
    title: '',
    setTitle: mockSetTitle,
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
import { POST_BODY_MAX_LENGTH } from '../../constants/validationConstants';

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
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

function pressPost() {
  fireEvent.press(screen.getByTestId('create-post-submit-button'));
}

describe('create-post draft preservation on submission failure', () => {
  it('successful submission resets the form and navigates away exactly once, after confirmation', async () => {
    const { promise, resolve } = deferred<{ id: string }>();
    mockMutateAsync.mockReturnValue(promise);

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    // Not yet resolved: no reset, no navigation.
    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();

    await act(async () => {
      resolve({ id: 'post-1' });
      await promise;
    });

    await waitFor(() => expect(mockReset).toHaveBeenCalledTimes(1));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('a failed mutation keeps the draft intact: no reset, no navigation, screen stays usable', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Failed to create post'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    // No new/duplicate error alert introduced here — the mutation's own
    // onError already surfaces it (mocked away, not re-tested here).
  });

  it('a network-shaped failure keeps the draft intact', async () => {
    mockMutateAsync.mockRejectedValue(new TypeError('Network request failed'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('a server-error-shaped failure keeps the draft intact', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Internal server error'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('a moderation-rejection-shaped failure keeps the draft intact', async () => {
    mockMutateAsync.mockRejectedValue(
      new Error('This content violates our community guidelines'),
    );

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('a rate-limit-shaped failure keeps the draft intact', async () => {
    mockMutateAsync.mockRejectedValue(
      new Error("You're posting too quickly. Please wait a moment."),
    );

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('an image upload failure keeps the draft intact and never calls the mutation', async () => {
    mockFormStateOverrides = { images: ['file:///local/image.jpg'] };
    mockUploadImage.mockRejectedValue(new Error('Failed to upload image. Please try again.'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockUploadImage).toHaveBeenCalled());
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('a client-side validation failure (body too long) keeps the draft intact and never calls the mutation', async () => {
    mockFormStateOverrides = { content: 'x'.repeat(POST_BODY_MAX_LENGTH + 1) };

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Invalid input', expect.any(String)));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
    // Validation fails before setIsSubmitting(true) is even called.
    expect(mockSetIsSubmitting).not.toHaveBeenCalled();
  });

  it('does not navigate or reset while the mutation is still pending (no premature reset/navigation)', async () => {
    const { promise } = deferred<{ id: string }>();
    mockMutateAsync.mockReturnValue(promise);

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    // Give any stray microtasks a chance to run — still must not have reset/navigated.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('double-tapping Post while a submission is in flight does not trigger a second mutation call', async () => {
    const { promise } = deferred<{ id: string }>();
    mockMutateAsync.mockReturnValue(promise);

    const { rerender } = render(<CreatePostScreen />);
    pressPost();
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    // Re-render with isSubmitting: true — this is exactly what the real
    // (unmocked) useCreatePostFormState would report on the next render
    // after handlePost's setIsSubmitting(true) call, and is also what
    // disables the Post button visually. Exercising handlePost's own
    // top-of-function guard (`if (isSubmitting || ...) return;`) directly,
    // rather than relying on Pressable's disabled-prop press-suppression,
    // which jest's fireEvent does not reliably emulate.
    mockFormStateOverrides = { isSubmitting: true };
    rerender(<CreatePostScreen />);
    fireEvent.press(screen.getByTestId('create-post-submit-button'));

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('a Lost & Found post: failed mutation keeps the draft intact and does not navigate to the Lost & Found tab', async () => {
    mockFormStateOverrides = {
      isLostFound: true,
      title: 'Lost wallet',
      location: 'Library',
      content: 'Black leather wallet',
    };
    mockMutateAsync.mockRejectedValue(new Error('Failed to create post'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('a Lost & Found post: successful mutation resets and navigates to the Lost & Found tab', async () => {
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

  it('a poll post: failed mutation keeps the poll options intact (mutation never destroys form state)', async () => {
    mockFormStateOverrides = {
      isPoll: true,
      pollOptions: ['Option A', 'Option B'],
      content: 'Vote now',
    };
    mockMutateAsync.mockRejectedValue(new Error('Failed to create post'));

    render(<CreatePostScreen />);
    pressPost();

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetIsSubmitting).toHaveBeenCalledWith(false));

    // setPollOptions is only ever called by user interaction / handleTogglePoll
    // in this screen — a failed submission must never call it.
    expect(mockSetPollOptions).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });
});
