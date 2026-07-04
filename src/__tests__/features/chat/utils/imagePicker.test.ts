/**
 * Tests for src/features/chat/utils/imagePicker.ts
 *
 * pickChatImage picks an image from the library and returns the raw URI without
 * any compression or manipulation (chat images are sent as-is for speed).
 */

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../../../../utils/logger';
import { pickChatImage } from '../../../../features/chat/utils/imagePicker';

const mockRequestPerms = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockRequestPerms.mockResolvedValue({ status: 'granted' });
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://picked.jpg', width: 1200, height: 800 }],
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickChatImage', () => {
  it('returns { localUri, aspectRatio } with the raw picker URI and computed ratio on happy path', async () => {
    const result = await pickChatImage();
    expect(result).toEqual({ localUri: 'file://picked.jpg', aspectRatio: 1.5 });
  });

  it('returns aspectRatio: null when the picker does not report dimensions', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://picked.jpg' }],
    });
    const result = await pickChatImage();
    expect(result).toEqual({ localUri: 'file://picked.jpg', aspectRatio: null });
  });

  it('passes allowsEditing: false to the image picker', async () => {
    await pickChatImage();
    expect(mockLaunchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: false })
    );
  });

  it('shows Alert and returns null when permissions are denied', async () => {
    mockRequestPerms.mockResolvedValue({ status: 'denied' });
    const result = await pickChatImage();
    expect(Alert.alert).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns null when user cancels picker', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: [] });
    const result = await pickChatImage();
    expect(result).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('returns null when picker returns no assets', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [] });
    const result = await pickChatImage();
    expect(result).toBeNull();
  });

  it('shows Alert and returns null when an exception is thrown', async () => {
    mockLaunchLibrary.mockRejectedValue(new Error('crash'));
    const result = await pickChatImage();
    expect(result).toBeNull();
    expect(Alert.alert).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
