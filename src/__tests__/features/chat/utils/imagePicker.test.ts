/**
 * Tests for src/features/chat/utils/imagePicker.ts
 */

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { WEBP: 'webp' },
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from '../../../../utils/logger';
import { pickChatImage } from '../../../../features/chat/utils/imagePicker';

const mockRequestPerms = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockManipulate = ImageManipulator.manipulateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // Default: permissions granted, picker returns an asset, manipulate returns URI
  mockRequestPerms.mockResolvedValue({ status: 'granted' });
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://picked.jpg' }],
  });
  mockManipulate.mockResolvedValue({ uri: 'file://manipulated.webp' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickChatImage', () => {
  it('returns { localUri } on happy path', async () => {
    const result = await pickChatImage();
    expect(result).toEqual({ localUri: 'file://manipulated.webp' });
  });

  it('calls manipulateAsync with resize width 1080 and compress 0.7 as WEBP', async () => {
    await pickChatImage();
    expect(mockManipulate).toHaveBeenCalledWith(
      'file://picked.jpg',
      [{ resize: { width: 1080 } }],
      expect.objectContaining({ compress: 0.7, format: 'webp' })
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
