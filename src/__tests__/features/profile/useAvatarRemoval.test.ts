import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useAvatarRemoval } from '../../../features/profile/hooks/useAvatarRemoval';

// ----- module mocks -------------------------------------------------------
jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../features/profile/hooks/useUpdateProfile', () => ({
  useUpdateProfile: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockRemove = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: { storage: { from: jest.fn(() => ({ remove: mockRemove })) } },
}));

import { useAuth } from '../../../context/AuthContext';
import { useUpdateProfile } from '../../../features/profile/hooks/useUpdateProfile';
import { logger } from '../../../utils/logger';
import { supabase } from '../../../lib/supabase';

const mockUseAuth = useAuth as jest.Mock;
const mockUseUpdateProfile = useUpdateProfile as jest.Mock;
const mockStorageFrom = supabase.storage.from as jest.Mock;

// --------------------------------------------------------------------------

describe('useAvatarRemoval', () => {
  let alertSpy: jest.SpyInstance;
  let mockMutateAsync: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    mockUseAuth.mockReturnValue({ session: { user: { id: 'user-123' } } });

    mockMutateAsync = jest.fn().mockResolvedValue(undefined);
    mockUseUpdateProfile.mockReturnValue({
      isPending: false,
      mutateAsync: mockMutateAsync,
    });

    mockRemove.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  describe('on successful removal', () => {
    it('returns { status: "success" }', async () => {
      const { result } = renderHook(() => useAvatarRemoval());
      let outcome: { status: string } | undefined;

      await act(async () => {
        outcome = await result.current.removeAvatar('user-123/avatar.jpg');
      });

      expect(outcome?.status).toBe('success');
    });

    it('deletes the storage object at the stored avatar path', async () => {
      const { result } = renderHook(() => useAvatarRemoval());

      await act(async () => { await result.current.removeAvatar('user-123/avatar.jpg'); });

      expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
      expect(mockRemove).toHaveBeenCalledWith(['user-123/avatar.jpg']);
    });

    it('nulls avatar_url via the shared profile-update mutation', async () => {
      const { result } = renderHook(() => useAvatarRemoval());

      await act(async () => { await result.current.removeAvatar('user-123/avatar.jpg'); });

      expect(mockMutateAsync).toHaveBeenCalledWith({ avatar_url: null });
    });

    it('does not show an error alert on success', async () => {
      const { result } = renderHook(() => useAvatarRemoval());

      await act(async () => { await result.current.removeAvatar('user-123/avatar.jpg'); });

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('when there is no stored avatar path', () => {
    it('skips the storage delete but still nulls avatar_url', async () => {
      const { result } = renderHook(() => useAvatarRemoval());

      await act(async () => { await result.current.removeAvatar(null); });

      expect(mockRemove).not.toHaveBeenCalled();
      expect(mockMutateAsync).toHaveBeenCalledWith({ avatar_url: null });
    });
  });

  describe('when the storage delete fails', () => {
    it('still nulls avatar_url and reports success (best-effort cleanup)', async () => {
      mockRemove.mockResolvedValue({ error: { message: 'not found' } });

      const { result } = renderHook(() => useAvatarRemoval());
      let outcome: { status: string } | undefined;

      await act(async () => {
        outcome = await result.current.removeAvatar('user-123/avatar.jpg');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({ avatar_url: null });
      expect(outcome?.status).toBe('success');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('when there is no session', () => {
    it('returns { status: "error" } without touching storage or the DB', async () => {
      mockUseAuth.mockReturnValue({ session: null });

      const { result } = renderHook(() => useAvatarRemoval());
      let outcome: { status: string; message?: string } | undefined;

      await act(async () => {
        outcome = await result.current.removeAvatar('user-123/avatar.jpg');
      });

      expect(outcome?.status).toBe('error');
      expect(mockRemove).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('when mutateAsync throws', () => {
    it('returns { status: "error" } and shows an alert', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Profile update failed'));

      const { result } = renderHook(() => useAvatarRemoval());
      let outcome: { status: string; message?: string } | undefined;

      await act(async () => {
        outcome = await result.current.removeAvatar('user-123/avatar.jpg');
      });

      expect(outcome?.status).toBe('error');
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Profile update failed');
    });
  });

  describe('isRemoving', () => {
    it('reflects updateProfileMutation.isPending', () => {
      mockUseUpdateProfile.mockReturnValue({ isPending: true, mutateAsync: jest.fn() });

      const { result } = renderHook(() => useAvatarRemoval());

      expect(result.current.isRemoving).toBe(true);
    });
  });
});
