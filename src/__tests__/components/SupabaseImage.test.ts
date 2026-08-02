/**
 * Tests for the public-URL construction shared by SupabaseImage / avatarUri
 * (src/utils/publicStorageUrl.ts) — specifically the Phase 6 cache-busting
 * `version` query param, which is what makes an overwritten deterministic
 * storage path (avatars/{userId}/avatar.{ext},
 * post-images/{communityId}/avatar.{ext}) actually refetch instead of
 * serving stale cached bytes under the same URL.
 *
 * Full component rendering isn't exercised here (SupabaseImage has no
 * existing render-level test harness in this repo, and its behavior is a
 * thin wrapper around this URL-building logic plus expo-image) — this
 * covers the actual cache-relevant logic directly.
 */
import { getPublicStorageUrl } from '../../utils/publicStorageUrl';
import { getAvatarUri } from '../../utils/avatarUri';

describe('getPublicStorageUrl', () => {
  it('builds the plain public URL with no version', () => {
    const url = getPublicStorageUrl('avatars', 'user-1/avatar.webp');
    expect(url).toMatch(/\/storage\/v1\/object\/public\/avatars\/user-1\/avatar\.webp$/);
    expect(url).not.toContain('?v=');
  });

  it('appends a ?v= query param when a version is supplied', () => {
    const url = getPublicStorageUrl('avatars', 'user-1/avatar.webp', '2026-08-02T12:00:00.000Z');
    expect(url).toContain('/avatars/user-1/avatar.webp?v=');
    expect(url).toContain(encodeURIComponent('2026-08-02T12:00:00.000Z'));
  });

  it('two different versions produce two different URLs for the same path (cache key changes)', () => {
    const urlA = getPublicStorageUrl('post-images', 'community-1/avatar.webp', 'v1');
    const urlB = getPublicStorageUrl('post-images', 'community-1/avatar.webp', 'v2');
    expect(urlA).not.toBe(urlB);
  });

  it('omitting version produces the same URL every time (no accidental cache-busting for untouched callers)', () => {
    const urlA = getPublicStorageUrl('chat-images', 'chat-1/msg-1.jpg');
    const urlB = getPublicStorageUrl('chat-images', 'chat-1/msg-1.jpg');
    expect(urlA).toBe(urlB);
  });

  it('null/undefined version is treated the same as omitted', () => {
    const base = getPublicStorageUrl('avatars', 'user-1/avatar.webp');
    expect(getPublicStorageUrl('avatars', 'user-1/avatar.webp', null)).toBe(base);
    expect(getPublicStorageUrl('avatars', 'user-1/avatar.webp', undefined)).toBe(base);
  });
});

describe('getAvatarUri', () => {
  it('returns the http(s) URL as-is for OAuth-style full URLs, ignoring version', () => {
    const url = getAvatarUri('https://lh3.googleusercontent.com/a/photo.jpg', 'some-version');
    expect(url).toBe('https://lh3.googleusercontent.com/a/photo.jpg');
  });

  it('builds a versioned public URL for a storage path', () => {
    const url = getAvatarUri('user-1/avatar.webp', '2026-08-02T12:00:00.000Z');
    expect(url).toContain('/avatars/user-1/avatar.webp?v=');
  });

  it('builds the plain URL when no version is given', () => {
    const url = getAvatarUri('user-1/avatar.webp');
    expect(url).not.toContain('?v=');
  });
});
