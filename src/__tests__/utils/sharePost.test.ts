/**
 * Tests for src/utils/sharePost.ts
 */

import { Alert, Share, Platform } from 'react-native';
import { getPostShareUrl, sharePost } from '../../utils/sharePost';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── getPostShareUrl ─────────────────────────────────────────────────────────

describe('getPostShareUrl', () => {
  it('contains the postId', () => {
    const url = getPostShareUrl('abc-123');
    expect(url).toContain('abc-123');
  });

  it('contains "/post/" path segment', () => {
    const url = getPostShareUrl('xyz');
    expect(url).toMatch(/\/post\/xyz/);
  });
});

// ── iOS native share ─────────────────────────────────────────────────────────

describe('sharePost on iOS', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  it('calls Share.share with url and message fields', async () => {
    await sharePost('post-1');
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('post-1'), message: expect.any(String) })
    );
  });

  it('swallows AbortError silently without Alert', async () => {
    const abortErr = new Error('share aborted');
    abortErr.name = 'AbortError';
    (Share.share as jest.Mock).mockRejectedValue(abortErr);
    await sharePost('post-2');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('calls Alert.alert for non-AbortError', async () => {
    (Share.share as jest.Mock).mockRejectedValue(new Error('share failed'));
    await sharePost('post-3');
    expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
  });
});

// ── Android native share ──────────────────────────────────────────────────────

describe('sharePost on Android', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
  });

  it('calls Share.share with a message string containing the URL', async () => {
    await sharePost('post-android');
    expect(Share.share).toHaveBeenCalled();
    const callArg = (Share.share as jest.Mock).mock.calls[0][0];
    expect(callArg.message).toContain('post-android');
  });

  it('swallows AbortError silently on Android', async () => {
    const abortErr = new Error('abort');
    abortErr.name = 'AbortError';
    (Share.share as jest.Mock).mockRejectedValue(abortErr);
    await sharePost('post-android-2');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

// ── Web platform ──────────────────────────────────────────────────────────────

describe('sharePost on web', () => {
  let originalNavigator: any;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
    originalNavigator = (global as any).navigator;
  });

  afterEach(() => {
    (global as any).navigator = originalNavigator;
  });

  it('calls navigator.share when available', async () => {
    const mockShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global, 'navigator', {
      value: { share: mockShare },
      writable: true,
      configurable: true,
    });
    await sharePost('post-web-1');
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('post-web-1') }));
  });

  it('swallows AbortError from navigator.share silently', async () => {
    const abortErr = new Error('abort');
    abortErr.name = 'AbortError';
    const mockShare = jest.fn().mockRejectedValue(abortErr);
    Object.defineProperty(global, 'navigator', {
      value: { share: mockShare },
      writable: true,
      configurable: true,
    });
    await sharePost('post-web-abort');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('falls back to clipboard.writeText when navigator.share is absent', async () => {
    const mockWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText: mockWriteText } },
      writable: true,
      configurable: true,
    });
    await sharePost('post-clipboard');
    expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('post-clipboard'));
  });
});
