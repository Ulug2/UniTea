import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useAvatarUpload } from '../../../features/profile/hooks/useAvatarUpload';

// ----- module mocks -------------------------------------------------------
jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../hooks/useImagePipeline', () => ({
  useImagePipeline: jest.fn(),
}));

jest.mock('../../../utils/supabaseImages', () => ({
  uploadImage: jest.fn(),
}));

jest.mock('../../../features/profile/hooks/useUpdateProfile', () => ({
  useUpdateProfile: jest.fn(),
}));

// supabase is imported in useAvatarUpload to pass to uploadImage
jest.mock('../../../lib/supabase', () => ({
  supabase: {},
}));

import { useAuth } from '../../../context/AuthContext';
import { useImagePipeline } from '../../../hooks/useImagePipeline';
import { uploadImage } from '../../../utils/supabaseImages';
import { useUpdateProfile } from '../../../features/profile/hooks/useUpdateProfile';

const mockUseAuth = useAuth as jest.Mock;
const mockUseImagePipeline = useImagePipeline as jest.Mock;
const mockUploadImage = uploadImage as jest.Mock;
const mockUseUpdateProfile = useUpdateProfile as jest.Mock;

// --------------------------------------------------------------------------

describe('useAvatarUpload', () => {
  let alertSpy: jest.SpyInstance;
  let mockMutateAsync: jest.Mock;
  let mockPickAndPrepareImage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    mockUseAuth.mockReturnValue({ session: null });

    mockPickAndPrepareImage = jest.fn();
    mockUseImagePipeline.mockReturnValue({ pickAndPrepareImage: mockPickAndPrepareImage });

    mockMutateAsync = jest.fn();
    mockUseUpdateProfile.mockReturnValue({
      isPending: false,
      mutateAsync: mockMutateAsync,
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // ── picker cancelled ───────────────────────────────────────────────────
  describe('when user cancels the picker', () => {
    it('returns { status: "cancelled" }', async () => {
      mockPickAndPrepareImage.mockResolvedValue(null);

      const { result } = renderHook(() => useAvatarUpload());
      let outcome: { status: string } | undefined;

      await act(async () => {
        outcome = await result.current.startAvatarUpload();
      });

      expect(outcome?.status).toBe('cancelled');
      expect(mockUploadImage).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  // ── happy path ─────────────────────────────────────────────────────────
  describe('on successful avatar upload', () => {
    beforeEach(() => {
      mockPickAndPrepareImage.mockResolvedValue({ uri: 'file://photo.jpg', aspectRatio: 1 });
      mockUploadImage.mockResolvedValue('https://cdn.example/avatars/me.webp');
      mockMutateAsync.mockResolvedValue(undefined);
    });

    it('returns { status: "success" }', async () => {
      const { result } = renderHook(() => useAvatarUpload());
      let outcome: { status: string } | undefined;

      await act(async () => {
        outcome = await result.current.startAvatarUpload();
      });

      expect(outcome?.status).toBe('success');
    });

    it('calls uploadImage with the picked URI and "avatars" bucket', async () => {
      const { result } = renderHook(() => useAvatarUpload());

      await act(async () => { await result.current.startAvatarUpload(); });

      expect(mockUploadImage).toHaveBeenCalledWith(
        'file://photo.jpg',
        expect.anything(), // supabase client
        'avatars',
      );
    });

    it('calls mutateAsync with the uploaded URL as avatar_url', async () => {
      const { result } = renderHook(() => useAvatarUpload());

      await act(async () => { await result.current.startAvatarUpload(); });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        avatar_url: 'https://cdn.example/avatars/me.webp',
      });
    });

    it('does not show an error alert on success', async () => {
      const { result } = renderHook(() => useAvatarUpload());

      await act(async () => { await result.current.startAvatarUpload(); });

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  // ── uploadImage throws ────────────────────────────────────────────────
  describe('when uploadImage throws', () => {
    it('returns { status: "error" } and shows an alert', async () => {
      mockPickAndPrepareImage.mockResolvedValue({ uri: 'file://photo.jpg', aspectRatio: 1 });
      mockUploadImage.mockRejectedValue(new Error('Upload failed'));

      const { result } = renderHook(() => useAvatarUpload());
      let outcome: { status: string; message?: string } | undefined;

      await act(async () => {
        outcome = await result.current.startAvatarUpload();
      });

      expect(outcome?.status).toBe('error');
      expect(outcome?.message).toBe('Upload failed');
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Upload failed');
    });
  });

  // ── mutateAsync throws ────────────────────────────────────────────────
  describe('when mutateAsync throws', () => {
    it('returns { status: "error" } and shows an alert', async () => {
      mockPickAndPrepareImage.mockResolvedValue({ uri: 'file://photo.jpg', aspectRatio: 1 });
      mockUploadImage.mockResolvedValue('https://cdn.example/img.webp');
      mockMutateAsync.mockRejectedValue(new Error('Profile update failed'));

      const { result } = renderHook(() => useAvatarUpload());
      let outcome: { status: string; message?: string } | undefined;

      await act(async () => {
        outcome = await result.current.startAvatarUpload();
      });

      expect(outcome?.status).toBe('error');
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Profile update failed');
    });
  });

  // ── isUploading ───────────────────────────────────────────────────────
  describe('isUploading', () => {
    it('reflects updateProfileMutation.isPending (false)', () => {
      mockUseUpdateProfile.mockReturnValue({ isPending: false, mutateAsync: jest.fn() });

      const { result } = renderHook(() => useAvatarUpload());

      expect(result.current.isUploading).toBe(false);
    });

    it('reflects updateProfileMutation.isPending (true)', () => {
      mockUseUpdateProfile.mockReturnValue({ isPending: true, mutateAsync: jest.fn() });

      const { result } = renderHook(() => useAvatarUpload());

      expect(result.current.isUploading).toBe(true);
    });
  });
});
