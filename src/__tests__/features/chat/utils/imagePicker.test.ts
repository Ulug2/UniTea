/**
 * Tests for src/features/chat/utils/imagePicker.ts
 *
 * pickChatImages picks up to `maxCount` images from the library and
 * compresses each with the shared upload pipeline (compressImageForUpload),
 * falling back to an image's original file and metadata if compressing it
 * fails.
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
import { pickChatImages } from '../../../../features/chat/utils/imagePicker';
import { compressImageForUpload } from '../../../../utils/imageCompression';

const mockRequestPerms = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockCompress = compressImageForUpload as jest.Mock;

const asset = (n: number, extra: Record<string, unknown> = {}) => ({
  uri: `file://picked-${n}.jpg`,
  width: 1200,
  height: 800,
  mimeType: 'image/jpeg',
  fileName: `picked-${n}.jpg`,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockRequestPerms.mockResolvedValue({ status: 'granted' });
  mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [asset(1)] });
  mockCompress.mockImplementation(async (uri: string) => uri.replace('.jpg', '.webp'));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickChatImages', () => {
  it('returns compressed WebP images with the picker aspect ratio', async () => {
    const result = await pickChatImages(3);
    expect(mockCompress).toHaveBeenCalledWith('file://picked-1.jpg', 1200);
    expect(result).toEqual([
      { localUri: 'file://picked-1.webp', mimeType: 'image/webp', fileName: null, aspectRatio: 1.5 },
    ]);
  });

  it('enables multi-select limited to maxCount when more than one image is allowed', async () => {
    await pickChatImages(3);
    expect(mockLaunchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 3, allowsEditing: false }),
    );
  });

  it('uses single selection when only one more image is allowed', async () => {
    await pickChatImages(1);
    const options = mockLaunchLibrary.mock.calls[0][0];
    expect(options.allowsMultipleSelection).toBeUndefined();
  });

  it('keeps pick order and trims to maxCount when the picker ignores selectionLimit', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset(1), asset(2), asset(3), asset(4)],
    });
    const result = await pickChatImages(2);
    expect(result.map((r) => r.localUri)).toEqual(['file://picked-1.webp', 'file://picked-2.webp']);
  });

  it('returns [] without opening the picker when no slots are left', async () => {
    await expect(pickChatImages(0)).resolves.toEqual([]);
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
  });

  it('returns aspectRatio: null when the picker does not report dimensions', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://picked-1.jpg', mimeType: 'image/jpeg', fileName: 'picked-1.jpg' }],
    });
    const [result] = await pickChatImages(3);
    expect(mockCompress).toHaveBeenCalledWith('file://picked-1.jpg', undefined);
    expect(result.aspectRatio).toBeNull();
  });

  it("falls back to an image's original file and metadata when compressing it fails", async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset(1), asset(2, { uri: 'content://media/48291', mimeType: undefined, fileName: undefined })],
    });
    mockCompress
      .mockResolvedValueOnce('file://picked-1.webp')
      .mockRejectedValueOnce(new Error('manipulator failed'));

    const result = await pickChatImages(3);
    expect(result).toEqual([
      { localUri: 'file://picked-1.webp', mimeType: 'image/webp', fileName: null, aspectRatio: 1.5 },
      { localUri: 'content://media/48291', mimeType: null, fileName: null, aspectRatio: 1.5 },
    ]);
    expect(logger.warn).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows Alert and returns [] when permissions are denied', async () => {
    mockRequestPerms.mockResolvedValue({ status: 'denied' });
    await expect(pickChatImages(3)).resolves.toEqual([]);
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('returns [] when the user cancels', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: [] });
    await expect(pickChatImages(3)).resolves.toEqual([]);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows Alert and returns [] when an exception is thrown', async () => {
    mockLaunchLibrary.mockRejectedValue(new Error('crash'));
    await expect(pickChatImages(3)).resolves.toEqual([]);
    expect(Alert.alert).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
