import { supabase } from "../lib/supabase";

const SIGNED_URL_TTL_SECONDS = 3600;
// Stop reusing a signed URL this long before it expires, so an image that
// starts downloading right before expiry still has time to finish.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };
const signedUrlCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

/**
 * Stable image-cache key for a private storage object. Signed URLs carry a
 * new token every time they're created, so caching by URL (expo-image's
 * default) misses on every app launch and between screens; caching by object
 * path lets the chat bubble, the full-screen viewer and later sessions all
 * reuse one download.
 */
export function storageImageCacheKey(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

/** A still-valid signed URL from the in-memory cache, or null. Synchronous. */
export function getCachedSignedUrl(bucket: string, path: string): string | null {
  const entry = signedUrlCache.get(storageImageCacheKey(bucket, path));
  return entry && entry.expiresAt - EXPIRY_MARGIN_MS > Date.now() ? entry.url : null;
}

/**
 * Signed URL for a private-bucket object. Concurrent calls for the same object
 * share one request. Throws if signing fails (e.g. the caller isn't allowed to
 * read the object).
 */
export function getSignedStorageUrl(bucket: string, path: string): Promise<string> {
  const key = storageImageCacheKey(bucket, path);
  const cached = getCachedSignedUrl(bucket, path);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        throw error ?? new Error("No signed URL returned");
      }
      signedUrlCache.set(key, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      });
      return data.signedUrl;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}
