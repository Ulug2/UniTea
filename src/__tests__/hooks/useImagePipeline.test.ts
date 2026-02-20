import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useImagePipeline } from '../../hooks/useImagePipeline';

// ----- module mocks -------------------------------------------------------
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { WEBP: 'webp' },
}));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ----- typed references ---------------------------------------------------
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from '../../utils/logger';

const mockLaunch = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockManipulate = ImageManipulator.manipulateAsync as jest.Mock;
const mockLoggerError = (logger as unknown as { error: jest.Mock }).error;

// --------------------------------------------------------------------------

describe('useImagePipeline', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // ── cancelled ──────────────────────────────────────────────────────────
  describe('when user cancels the picker', () => {
    it('returns null without calling ImageManipulator', async () => {
      mockLaunch.mockResolvedValue({ canceled: true, assets: [] });

      const { result } = renderHook(() => useImagePipeline());
      let returnedUri: string | null = 'sentinel';

      await act(async () => {
        returnedUri = await result.current.pickAndPrepareImage();
      });

      expect(returnedUri).toBeNull();
      expect(mockManipulate).not.toHaveBeenCalled();
    });
  });

  // ── no uri on asset ────────────────────────────────────────────────────
  describe('when the picked asset has no URI', () => {
    it('returns null without manipulating', async () => {
      mockLaunch.mockResolvedValue({
        canceled: false,
        assets: [{ uri: '' }],
      });

      const { result } = renderHook(() => useImagePipeline());
      let returnedUri: string | null = 'sentinel';

      await act(async () => {
        returnedUri = await result.current.pickAndPrepareImage();
      });

      expect(returnedUri).toBeNull();
      expect(mockManipulate).not.toHaveBeenCalled();
    });

    it('returns null when assets array is undefined', async () => {
      mockLaunch.mockResolvedValue({ canceled: false, assets: undefined });

      const { result } = renderHook(() => useImagePipeline());
      let returnedUri: string | null = 'sentinel';

      await act(async () => {
        returnedUri = await result.current.pickAndPrepareImage();
      });

      expect(returnedUri).toBeNull();
    });
  });

  // ── happy path ─────────────────────────────────────────────────────────
  describe('when the pick and manipulate both succeed', () => {
    beforeEach(() => {
      mockLaunch.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://original.png' }],
      });
      mockManipulate.mockResolvedValue({ uri: 'file://manipulated.webp' });
    });

    it('returns the manipulated URI', async () => {
      const { result } = renderHook(() => useImagePipeline());
      let returnedUri: string | null = null;

      await act(async () => {
        returnedUri = await result.current.pickAndPrepareImage();
      });

      expect(returnedUri).toBe('file://manipulated.webp');
    });

    it('calls manipulateAsync with resize width IMAGE_MAX_WIDTH=1080', async () => {
      const { result } = renderHook(() => useImagePipeline());

      await act(async () => { await result.current.pickAndPrepareImage(); });

      const [, actions] = mockManipulate.mock.calls[0] as [string, Array<{ resize: { width: number } }>];
      expect(actions[0].resize.width).toBe(1080);
    });

    it('calls manipulateAsync with compress=IMAGE_COMPRESS_QUALITY (0.7)', async () => {
      const { result } = renderHook(() => useImagePipeline());

      await act(async () => { await result.current.pickAndPrepareImage(); });

      const [, , options] = mockManipulate.mock.calls[0] as [string, unknown[], { compress: number }];
      expect(options.compress).toBe(0.7);
    });

    it('calls manipulateAsync with WEBP SaveFormat', async () => {
      const { result } = renderHook(() => useImagePipeline());

      await act(async () => { await result.current.pickAndPrepareImage(); });

      const [, , options] = mockManipulate.mock.calls[0] as [string, unknown[], { format: string }];
      // SaveFormat["WEBP"] resolves to the mocked value 'webp'
      expect(options.format).toBe('webp');
    });

    it('passes the original asset URI to manipulateAsync', async () => {
      const { result } = renderHook(() => useImagePipeline());

      await act(async () => { await result.current.pickAndPrepareImage(); });

      expect(mockManipulate.mock.calls[0][0]).toBe('file://original.png');
    });
  });

  // ── allowEditing option ────────────────────────────────────────────────
  describe('allowEditing option', () => {
    it('defaults allowsEditing to true', async () => {
      mockLaunch.mockResolvedValue({ canceled: true, assets: [] });
      const { result } = renderHook(() => useImagePipeline());

      await act(async () => { await result.current.pickAndPrepareImage(); });

      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ allowsEditing: true }),
      );
    });

    it('passes allowsEditing: false when allowEditing=false', async () => {
      mockLaunch.mockResolvedValue({ canceled: true, assets: [] });
      const { result } = renderHook(() => useImagePipeline({ allowEditing: false }));

      await act(async () => { await result.current.pickAndPrepareImage(); });

      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ allowsEditing: false }),
      );
    });
  });

  // ── error handling ─────────────────────────────────────────────────────
  describe('when ImagePicker throws', () => {
    it('shows error alert and returns null', async () => {
      mockLaunch.mockRejectedValue(new Error('Picker crashed'));

      const { result } = renderHook(() => useImagePipeline());
      let returnedUri: string | null = 'sentinel';

      await act(async () => { returnedUri = await result.current.pickAndPrepareImage(); });

      expect(returnedUri).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to process image. Please try again.');
      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  describe('when ImageManipulator throws', () => {
    it('shows error alert and returns null', async () => {
      mockLaunch.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://img.png' }],
      });
      mockManipulate.mockRejectedValue(new Error('Manipulate failed'));

      const { result } = renderHook(() => useImagePipeline());
      let returnedUri: string | null = 'sentinel';

      await act(async () => { returnedUri = await result.current.pickAndPrepareImage(); });

      expect(returnedUri).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to process image. Please try again.');
      expect(mockLoggerError).toHaveBeenCalled();
    });
  });
});
