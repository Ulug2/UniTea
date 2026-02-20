import { normalizeAuthError } from '../../utils/authErrors';
import type { AuthErrorKind, NormalizedAuthError } from '../../utils/authErrors';

describe('normalizeAuthError', () => {
  function expectResult(
    result: NormalizedAuthError,
    kind: AuthErrorKind,
    messageSubstring: string,
    rawMessage: string
  ) {
    expect(result.kind).toBe(kind);
    expect(result.message).toContain(messageSubstring);
    expect(result.rawMessage).toBe(rawMessage);
  }

  // ── toMessage branch: Error instance ────────────────────────────────────────
  describe('input: Error instance', () => {
    it('extracts the message string from an Error', () => {
      const result = normalizeAuthError(new Error('too many requests'));
      expect(result.kind).toBe('rate_limit');
      expect(result.rawMessage).toBe('too many requests');
    });

    it('returns "Unknown error" for an Error with empty message', () => {
      const result = normalizeAuthError(new Error(''));
      expect(result.kind).toBe('unknown');
      expect(result.rawMessage).toBe('Unknown error');
    });
  });

  // ── toMessage branch: plain string ──────────────────────────────────────────
  describe('input: plain string', () => {
    it('uses the string directly as rawMessage', () => {
      const result = normalizeAuthError('rate limit exceeded');
      expect(result.kind).toBe('rate_limit');
      expect(result.rawMessage).toBe('rate limit exceeded');
    });
  });

  // ── toMessage branch: JSON-serializable object ───────────────────────────────
  describe('input: JSON-serializable object', () => {
    it('serializes the object and falls through to unknown', () => {
      const result = normalizeAuthError({ code: 999, detail: 'oops' });
      expect(result.kind).toBe('unknown');
      expect(result.rawMessage).toContain('"code"');
    });
  });

  // ── rate_limit ───────────────────────────────────────────────────────────────
  describe('kind: rate_limit', () => {
    it('matches "too many"', () => {
      expectResult(
        normalizeAuthError(new Error('Too many login attempts')),
        'rate_limit',
        'Too many attempts',
        'Too many login attempts'
      );
    });

    it('matches "rate limit"', () => {
      expectResult(
        normalizeAuthError(new Error('rate limit reached')),
        'rate_limit',
        'Too many attempts',
        'rate limit reached'
      );
    });
  });

  // ── invalid_credentials ──────────────────────────────────────────────────────
  describe('kind: invalid_credentials', () => {
    it('matches "invalid login credentials"', () => {
      expectResult(
        normalizeAuthError(new Error('Invalid login credentials')),
        'invalid_credentials',
        'Incorrect email or password',
        'Invalid login credentials'
      );
    });

    it('matches "invalid credentials"', () => {
      expectResult(
        normalizeAuthError(new Error('invalid credentials provided')),
        'invalid_credentials',
        'Incorrect email or password',
        'invalid credentials provided'
      );
    });
  });

  // ── email_not_confirmed ──────────────────────────────────────────────────────
  describe('kind: email_not_confirmed', () => {
    it('matches "email not confirmed"', () => {
      expectResult(
        normalizeAuthError(new Error('email not confirmed')),
        'email_not_confirmed',
        'verify your email',
        'email not confirmed'
      );
    });
  });

  // ── user_already_registered ──────────────────────────────────────────────────
  describe('kind: user_already_registered', () => {
    it('matches "user already registered"', () => {
      expectResult(
        normalizeAuthError(new Error('User already registered')),
        'user_already_registered',
        'already exists',
        'User already registered'
      );
    });
  });

  // ── password_too_short ───────────────────────────────────────────────────────
  describe('kind: password_too_short', () => {
    it('matches "password should be at least"', () => {
      expectResult(
        normalizeAuthError(new Error('Password should be at least 6 characters')),
        'password_too_short',
        'at least 6 characters',
        'Password should be at least 6 characters'
      );
    });
  });

  // ── invalid_email ────────────────────────────────────────────────────────────
  describe('kind: invalid_email', () => {
    it('matches "invalid email"', () => {
      expectResult(
        normalizeAuthError(new Error('invalid email format')),
        'invalid_email',
        'valid email',
        'invalid email format'
      );
    });
  });

  // ── network ──────────────────────────────────────────────────────────────────
  describe('kind: network', () => {
    it('matches "network"', () => {
      expectResult(
        normalizeAuthError(new Error('network request failed')),
        'network',
        'Network error',
        'network request failed'
      );
    });
  });

  // ── timeout ──────────────────────────────────────────────────────────────────
  describe('kind: timeout', () => {
    it('matches "timeout"', () => {
      expectResult(
        normalizeAuthError(new Error('request timeout')),
        'timeout',
        'timed out',
        'request timeout'
      );
    });
  });

  // ── unknown ──────────────────────────────────────────────────────────────────
  describe('kind: unknown', () => {
    it('falls through when no pattern matches', () => {
      expectResult(
        normalizeAuthError(new Error('some totally random error')),
        'unknown',
        'Something went wrong',
        'some totally random error'
      );
    });

    it('handles null input gracefully (JSON.stringify(null) === "null")', () => {
      const result = normalizeAuthError(null);
      expect(result.kind).toBe('unknown');
      expect(result.rawMessage).toBe('null');
    });
  });

  // ── priority / order ─────────────────────────────────────────────────────────
  describe('priority ordering', () => {
    it('rate_limit takes priority over other patterns', () => {
      // Contains both "too many" and "network" — rate_limit should win (checked first)
      const result = normalizeAuthError(new Error('too many network errors'));
      expect(result.kind).toBe('rate_limit');
    });
  });
});
