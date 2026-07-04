/**
 * Tests for src/app/+native-intent.ts — redirectSystemPath, which rewrites
 * incoming deep links (Universal Links, custom scheme) before Expo Router
 * navigates. Covers post/L&F rewriting and the password-recovery link
 * rewriting (token_hash / legacy code / no-token fallback).
 *
 * Expo Router always invokes this with a FULL, scheme-prefixed URL (it's
 * sourced from Linking.getInitialURL(), never a bare path) — see
 * node_modules/expo-router/build/getLinkingConfig.js. Linking.parse cannot
 * reliably split path from query on a schemeless/bare path, so test inputs
 * here intentionally use the app's real custom scheme (myunitea://) and the
 * Universal Link host (https://unitea.app) to match real invocations.
 *
 * Both scheme families are exercised deliberately: for a custom scheme,
 * Linking.parse puts the first path component in `hostname` (not `path`),
 * unlike https:// where it's the real domain and the route name stays in
 * `path`. redirectSystemPath has to normalize that difference itself — see
 * the `isCustomScheme` handling in the implementation — so both are covered
 * per branch rather than assuming one scheme's behavior generalizes.
 */
import { redirectSystemPath } from '../../app/+native-intent';

const initial = true;

describe('redirectSystemPath', () => {
  describe('post links', () => {
    it('routes a regular post link to /post/:id with fromDeeplink=1 (custom scheme)', () => {
      const result = redirectSystemPath({ path: 'myunitea://post/abc123', initial });
      expect(result).toBe('/post/abc123?fromDeeplink=1');
    });

    it('routes a regular post link to /post/:id with fromDeeplink=1 (universal link)', () => {
      const result = redirectSystemPath({
        path: 'https://unitea.app/post/abc123',
        initial,
      });
      expect(result).toBe('/post/abc123?fromDeeplink=1');
    });

    it('routes a lost & found post (postType=lost_found) to /lostfoundpost/:id', () => {
      const result = redirectSystemPath({
        path: 'myunitea://post/abc123?postType=lost_found',
        initial,
      });
      expect(result).toBe('/lostfoundpost/abc123?fromDeeplink=1');
    });

    it('treats post_type (snake_case) the same as postType', () => {
      const result = redirectSystemPath({
        path: 'myunitea://post/abc123?post_type=lost_found',
        initial,
      });
      expect(result).toBe('/lostfoundpost/abc123?fromDeeplink=1');
    });

    it('leaves a post link with no id unmodified', () => {
      const result = redirectSystemPath({ path: 'myunitea://post', initial });
      expect(result).toBe('myunitea://post');
    });
  });

  describe('password recovery links', () => {
    it('rewrites a token_hash link to include type=recovery', () => {
      const result = redirectSystemPath({
        path: 'myunitea://reset-password?token_hash=abc.def&type=recovery',
        initial,
      });
      expect(result).toBe('/reset-password?token_hash=abc.def&type=recovery');
    });

    it('re-encodes a token_hash that arrived percent-encoded (round-trips cleanly)', () => {
      const rawTokenHash = 'abc+def/ghi';
      const result = redirectSystemPath({
        path: `myunitea://reset-password?token_hash=${encodeURIComponent(rawTokenHash)}`,
        initial,
      });
      expect(result).toBe(
        `/reset-password?token_hash=${encodeURIComponent(rawTokenHash)}&type=recovery`,
      );
    });

    it('falls back to the legacy code param when token_hash is absent', () => {
      const result = redirectSystemPath({
        path: 'myunitea://reset-password?code=pkce_abc123',
        initial,
      });
      expect(result).toBe('/reset-password?code=pkce_abc123');
    });

    it('prefers token_hash over code when both are somehow present', () => {
      const result = redirectSystemPath({
        path: 'myunitea://reset-password?token_hash=th1&code=c1',
        initial,
      });
      expect(result).toBe('/reset-password?token_hash=th1&type=recovery');
    });

    it('routes to the bare reset-password path when neither token is present', () => {
      const result = redirectSystemPath({ path: 'myunitea://reset-password', initial });
      expect(result).toBe('/reset-password');
    });

    it('also works via the Universal Link host', () => {
      const result = redirectSystemPath({
        path: 'https://unitea.app/reset-password?token_hash=th1',
        initial,
      });
      expect(result).toBe('/reset-password?token_hash=th1&type=recovery');
    });
  });

  describe('unrecognized paths', () => {
    it('passes through a path it does not recognize unmodified', () => {
      const result = redirectSystemPath({ path: 'myunitea://communities/123', initial });
      expect(result).toBe('myunitea://communities/123');
    });

    it('passes through the raw path when it is empty', () => {
      const result = redirectSystemPath({ path: '', initial });
      expect(result).toBe('');
    });
  });
});
