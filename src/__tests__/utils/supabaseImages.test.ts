/**
 * Tests for src/utils/supabaseImages.ts
 *
 * Uses real timers for most tests; fake timers only for the timeout test.
 */

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { uploadImage } from '../../utils/supabaseImages';

const mockGetInfoAsync = FileSystem.getInfoAsync as jest.Mock;

function makeMockSupabase(uploadResult: { data?: any; error?: any } = { data: { path: 'uploads/test.jpg' }, error: null }) {
  const upload = jest.fn().mockResolvedValue(uploadResult);
  const getPublicUrl = jest.fn().mockReturnValue({
    data: { publicUrl: 'https://storage.example.com/uploads/test.jpg' },
  });
  return {
    storage: {
      from: jest.fn().mockReturnValue({ upload, getPublicUrl }),
    },
    _upload: upload,
    _getPublicUrl: getPublicUrl,
  };
}

// Silence fetch mock noise
let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 * 100 }); // 100 KB
  // Default: fetch returns a small array buffer
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    statusText: 'OK',
    arrayBuffer: async () => new ArrayBuffer(1024),
  });
});

// ── validateImage (extension) ─────────────────────────────────────────────────

describe('uploadImage — extension validation', () => {
  it('throws on invalid file extension', async () => {
    const supabase = makeMockSupabase() as any;
    await expect(uploadImage('file://test.bmp', supabase)).rejects.toThrow(
      /Invalid file type/
    );
  });

  it('accepts valid extensions (jpg, png, webp, gif, jpeg, heic, heif) via URI fallback', async () => {
    for (const ext of ['jpg', 'png', 'webp', 'gif', 'jpeg', 'heic', 'heif']) {
      const supabase = makeMockSupabase() as any;
      // Should not throw
      await expect(uploadImage(`file://test.${ext}`, supabase)).resolves.toBeDefined();
    }
  });
});

// ── type resolution: mimeType > fileName > URI extension ───────────────────────

describe('uploadImage — type resolution (mimeType / fileName / URI)', () => {
  it('resolves type from mimeType even when the URI has no extension at all (Android content:// URI)', async () => {
    const supabase = makeMockSupabase() as any;
    await expect(
      uploadImage(
        'content://media/external/images/media/48291',
        supabase,
        'chat-images',
        undefined,
        'image/jpeg',
      ),
    ).resolves.toBeDefined();
  });

  it('resolves type from mimeType even when the URI has query parameters after a misleading extension-like segment', async () => {
    const supabase = makeMockSupabase() as any;
    await expect(
      uploadImage(
        'content://media/external/images/media/48291?ts=12345',
        supabase,
        'chat-images',
        undefined,
        'image/png',
      ),
    ).resolves.toBeDefined();
  });

  it('accepts HEIC via mimeType (image/heic) and sends the correct Content-Type/extension', async () => {
    const supabase = makeMockSupabase() as any;
    await uploadImage(
      'file:///var/mobile/.../ImagePicker/ABCDEF.heic',
      supabase,
      'chat-images',
      undefined,
      'image/heic',
    );

    const uploadCall = supabase._upload.mock.calls[0];
    const [path, , uploadOptions] = uploadCall;
    expect(uploadOptions.contentType).toBe('image/heic');
    expect(path.endsWith('.heic')).toBe(true);
  });

  it('accepts HEIF via mimeType (image/heif) and sends the correct Content-Type/extension', async () => {
    const supabase = makeMockSupabase() as any;
    await uploadImage(
      'file:///storage/emulated/0/DCIM/photo.heif',
      supabase,
      'chat-images',
      undefined,
      'image/heif',
    );

    const uploadCall = supabase._upload.mock.calls[0];
    const [path, , uploadOptions] = uploadCall;
    expect(uploadOptions.contentType).toBe('image/heif');
    expect(path.endsWith('.heif')).toBe(true);
  });

  it('falls back to fileName extension when mimeType is unavailable', async () => {
    const supabase = makeMockSupabase() as any;
    await expect(
      uploadImage(
        'content://media/external/images/media/999',
        supabase,
        'chat-images',
        undefined,
        null,
        'IMG_1234.webp',
      ),
    ).resolves.toBeDefined();
  });

  it('falls back to URI extension when neither mimeType nor fileName is available', async () => {
    const supabase = makeMockSupabase() as any;
    await expect(
      uploadImage('file:///cache/tmp123.png', supabase, 'chat-images', undefined, null, null),
    ).resolves.toBeDefined();
  });

  it('prefers mimeType over a misleading fileName/URI extension', async () => {
    const supabase = makeMockSupabase() as any;
    await uploadImage(
      'file:///cache/tmp.png',
      supabase,
      'chat-images',
      undefined,
      'image/webp',
      'export.png',
    );

    const uploadCall = supabase._upload.mock.calls[0];
    const [, , uploadOptions] = uploadCall;
    expect(uploadOptions.contentType).toBe('image/webp');
  });

  it('rejects when mimeType, fileName, and URI all fail to resolve to an allowed type', async () => {
    const supabase = makeMockSupabase() as any;
    await expect(
      uploadImage(
        'content://media/external/documents/media/1',
        supabase,
        'chat-images',
        undefined,
        'application/pdf',
        'document.pdf',
      ),
    ).rejects.toThrow(/Invalid file type/);
  });

  it('rejects an extension-less content:// URI with no mimeType or fileName metadata', async () => {
    const supabase = makeMockSupabase() as any;
    await expect(
      uploadImage('content://media/external/images/media/1', supabase),
    ).rejects.toThrow(/Invalid file type/);
  });
});

// ── validateImage (file size) ─────────────────────────────────────────────────

describe('uploadImage — file size validation', () => {
  it('throws when file is over 10 MB', async () => {
    // FileSystem-level check is inside a try-catch that swallows it;
    // the reliable path is the secondary check on arrayBuffer.byteLength.
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      arrayBuffer: async () => new ArrayBuffer(11 * 1024 * 1024),
    });
    const supabase = makeMockSupabase() as any;
    await expect(uploadImage('file://big.jpg', supabase)).rejects.toThrow(/too large/);
  }, 30_000); // extended timeout: retryUpload delays up to ~7s total

  it('accepts files under the size limit', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 5 * 1024 * 1024 });
    const supabase = makeMockSupabase() as any;
    await expect(uploadImage('file://ok.jpg', supabase)).resolves.toBeDefined();
  });
});

// ── uploadImage happy path ────────────────────────────────────────────────────

describe('uploadImage — happy path', () => {
  it('calls supabase.storage.from(bucket).upload and returns public URL', async () => {
    const supabase = makeMockSupabase() as any;
    const result = await uploadImage('file://photo.jpg', supabase, 'chat-images');
    expect(supabase.storage.from).toHaveBeenCalledWith('chat-images');
    expect(supabase._upload).toHaveBeenCalled();
    expect(typeof result).toBe('string');
  });
});

// ── Retry logic ───────────────────────────────────────────────────────────────

describe('uploadImage — retry logic', () => {
  it('retries and succeeds after transient failures', async () => {
    const supabase = makeMockSupabase() as any;
    const serverErr = Object.assign(new Error('server error'), { statusCode: 500 });
    // Fail twice then succeed
    supabase._upload
      .mockRejectedValueOnce(serverErr)
      .mockRejectedValueOnce(serverErr)
      .mockResolvedValueOnce({ data: { path: 'uploads/retry.jpg' }, error: null });

    const result = await uploadImage('file://retry.jpg', supabase, 'post-images');
    expect(supabase._upload).toHaveBeenCalledTimes(3);
    expect(typeof result).toBe('string');
  });

  it('does NOT retry on 4xx client errors', async () => {
    const supabase = makeMockSupabase() as any;
    const clientErr = Object.assign(new Error('bad request'), { statusCode: 400 });
    supabase._upload.mockRejectedValue(clientErr);

    await expect(uploadImage('file://bad.jpg', supabase)).rejects.toThrow();
    // Should only be called once (no retry)
    expect(supabase._upload).toHaveBeenCalledTimes(1);
  });
});

// ── Timeout ───────────────────────────────────────────────────────────────────

describe('uploadImage — timeout', () => {
  it('rejects with timeout error when upload takes too long', async () => {
    jest.useFakeTimers();
    const supabase = makeMockSupabase() as any;

    // Never resolve
    supabase._upload.mockImplementation(
      () => new Promise<never>(() => {})
    );
    // Also make fetch never resolve
    (global.fetch as jest.Mock) = jest.fn().mockImplementation(
      () => new Promise<never>(() => {})
    );

    const promise = uploadImage('file://slow.jpg', supabase);
    // Flush the microtask chain so validateImage completes and
    // uploadWithTimeout registers its setTimeout before we advance timers.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    // Advance past the 30s timeout
    jest.advanceTimersByTime(31_000);

    await expect(promise).rejects.toThrow(/timeout|timed out/i);
    jest.useRealTimers();
  });
});
