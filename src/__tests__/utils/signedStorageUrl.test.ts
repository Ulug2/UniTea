/**
 * Tests for src/utils/signedStorageUrl.ts — shared signed-URL resolution for
 * private buckets (chat-images). The module cache persists across tests, so
 * every test uses its own object path.
 */
const mockCreateSignedUrl = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: { from: jest.fn(() => ({ createSignedUrl: mockCreateSignedUrl })) },
  },
}));

import { supabase } from '../../lib/supabase';
import {
  getCachedSignedUrl,
  getSignedStorageUrl,
  storageImageCacheKey,
} from '../../utils/signedStorageUrl';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSignedUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://signed/${path}?token=${Math.random()}` },
    error: null,
  }));
});

describe('getSignedStorageUrl', () => {
  it('signs the object in the given bucket for one hour', async () => {
    await getSignedStorageUrl('chat-images', 'a.webp');
    expect(supabase.storage.from).toHaveBeenCalledWith('chat-images');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('a.webp', 3600);
  });

  it('shares one request between concurrent callers and caches the result', async () => {
    const [first, second] = await Promise.all([
      getSignedStorageUrl('chat-images', 'd.webp'),
      getSignedStorageUrl('chat-images', 'd.webp'),
    ]);
    const third = await getSignedStorageUrl('chat-images', 'd.webp');

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(getCachedSignedUrl('chat-images', 'd.webp')).toBe(first);
  });

  it('throws on a signing error and does not cache it, so the next call retries', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: new Error('denied') });
    await expect(getSignedStorageUrl('chat-images', 'f.webp')).rejects.toThrow('denied');
    expect(getCachedSignedUrl('chat-images', 'f.webp')).toBeNull();

    await expect(getSignedStorageUrl('chat-images', 'f.webp')).resolves.toContain('f.webp');
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2);
  });
});

describe('storageImageCacheKey', () => {
  it('is stable per object, independent of the signed token', () => {
    expect(storageImageCacheKey('chat-images', 'x/y.webp')).toBe('chat-images/x/y.webp');
  });
});
