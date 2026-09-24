jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { WEBP: 'webp' },
}));

import * as ImageManipulator from 'expo-image-manipulator';
import { compressImageForUpload } from '../../utils/imageCompression';

const mockManipulate = ImageManipulator.manipulateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockManipulate.mockResolvedValue({ uri: 'file://out.webp' });
});

describe('compressImageForUpload', () => {
  it('resizes to 1080px wide and encodes WebP when the image is wider', async () => {
    await expect(compressImageForUpload('file://in.jpg', 4032)).resolves.toBe('file://out.webp');
    expect(mockManipulate).toHaveBeenCalledWith(
      'file://in.jpg',
      [{ resize: { width: 1080 } }],
      { compress: 0.7, format: 'webp' },
    );
  });

  it('resizes when the width is unknown (existing post/avatar behavior)', async () => {
    await compressImageForUpload('file://in.jpg');
    expect(mockManipulate.mock.calls[0][1]).toEqual([{ resize: { width: 1080 } }]);
  });

  it('never upscales an image that is already narrow enough, but still re-encodes it', async () => {
    await compressImageForUpload('file://small.png', 800);
    expect(mockManipulate).toHaveBeenCalledWith('file://small.png', [], {
      compress: 0.7,
      format: 'webp',
    });
  });
});
