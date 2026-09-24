/**
 * Tests for src/features/chat/utils/imagePicker.ts
 *
 * pickChatImage picks an image from the library and compresses it with the
 * shared upload pipeline (compressImageForUpload), falling back to the
 * original picker file and metadata if compression fails.
 */

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../../../utils/imageCompression', () => ({
  COMPRESSED_IMAGE_MIME_TYPE: 'image/webp',
  compressImageForUpload: jest.fn(),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../../../../utils/logger';
import { pickChatImage } from '../../../../features/chat/utils/imagePicker';
import { compressImageForUpload } from '../../../../utils/imageCompression';

const mockRequestPerms = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockCompress = compressImageForUpload as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockRequestPerms.mockResolvedValue({ status: 'granted' });
  mockCompress.mockResolvedValue('file://compressed.webp');
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file://picked.jpg',
        width: 1200,
        height: 800,
        mimeType: 'image/jpeg',
        fileName: 'picked.jpg',
      },
    ],
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickChatImage', () => {
  it('returns the compressed WebP URI with its type and the picker aspect ratio on happy path', async () => {
    const result = await pickChatImage();
    expect(mockCompress).toHaveBeenCalledWith('file://picked.jpg', 1200);
    expect(result).toEqual({
      localUri: 'file://compressed.webp',
      mimeType: 'image/webp',
      fileName: null,
      aspectRatio: 1.5,
    });
  });

  it('returns aspectRatio: null (and lets compression resize) when the picker does not report dimensions', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://picked.jpg', mimeType: 'image/jpeg', fileName: 'picked.jpg' }],
    });
    const result = await pickChatImage();
    expect(mockCompress).toHaveBeenCalledWith('file://picked.jpg', undefined);
    expect(result).toEqual({
      localUri: 'file://compressed.webp',
      mimeType: 'image/webp',
      fileName: null,
      aspectRatio: null,
    });
  });

  it('converts a HEIC photo to WebP so every recipient platform can display it', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///var/mobile/.../ImagePicker/ABCDEF.heic',
          width: 3024,
          height: 4032,
          mimeType: 'image/heic',
          fileName: 'IMG_0001.HEIC',
        },
      ],
    });
    const result = await pickChatImage();
    expect(result).toEqual({
      localUri: 'file://compressed.webp',
      mimeType: 'image/webp',
      fileName: null,
      aspectRatio: 3024 / 4032,
    });
  });

  describe('when compression fails', () => {
    beforeEach(() => {
      mockCompress.mockRejectedValue(new Error('manipulator failed'));
    });

    it('falls back to the original file with its picker metadata instead of failing the pick', async () => {
      const result = await pickChatImage();
      expect(result).toEqual({
        localUri: 'file://picked.jpg',
        mimeType: 'image/jpeg',
        fileName: 'picked.jpg',
        aspectRatio: 1.5,
      });
      expect(logger.warn).toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('keeps mimeType/fileName null when the provider did not report them (some Android content:// providers)', async () => {
      mockLaunchLibrary.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://media/external/images/media/48291', width: 1200, height: 800 }],
      });
      const result = await pickChatImage();
      expect(result).toEqual({
        localUri: 'content://media/external/images/media/48291',
        mimeType: null,
        fileName: null,
        aspectRatio: 1.5,
      });
    });
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
