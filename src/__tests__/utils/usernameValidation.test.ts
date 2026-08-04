/**
 * Tests for src/utils/usernameValidation.ts (Phase 7.6.1)
 */
import { validateUsername } from '../../utils/usernameValidation';
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
} from '../../constants/validationConstants';

describe('validateUsername', () => {
  it('rejects an empty string', () => {
    expect(validateUsername('')).toBe('Username cannot be empty.');
  });

  it('rejects whitespace-only input', () => {
    expect(validateUsername('   ')).toBe('Username cannot be empty.');
  });

  it('rejects null/undefined', () => {
    expect(validateUsername(null)).toBe('Username cannot be empty.');
    expect(validateUsername(undefined)).toBe('Username cannot be empty.');
  });

  it('rejects a username shorter than the minimum length', () => {
    const tooShort = 'a'.repeat(USERNAME_MIN_LENGTH - 1);
    expect(validateUsername(tooShort)).toMatch(/at least/);
  });

  it('rejects a username longer than the maximum length', () => {
    const tooLong = 'a'.repeat(USERNAME_MAX_LENGTH + 1);
    expect(validateUsername(tooLong)).toMatch(/at most/);
  });

  it('accepts a username at exactly the minimum length', () => {
    expect(validateUsername('a'.repeat(USERNAME_MIN_LENGTH))).toBeNull();
  });

  it('accepts a username at exactly the maximum length', () => {
    expect(validateUsername('a'.repeat(USERNAME_MAX_LENGTH))).toBeNull();
  });

  it('rejects invalid characters (spaces, punctuation, emoji)', () => {
    expect(validateUsername('john smith')).toMatch(/letters, numbers, and underscores/);
    expect(validateUsername('john@smith')).toMatch(/letters, numbers, and underscores/);
    expect(validateUsername('john.smith')).toMatch(/letters, numbers, and underscores/);
    expect(validateUsername('john-smith')).toMatch(/letters, numbers, and underscores/);
    expect(validateUsername('john😀')).toMatch(/letters, numbers, and underscores/);
  });

  // Explicit examples from the Phase 7.6.1 spec.
  it('allows plain alphanumeric usernames', () => {
    expect(validateUsername('johnsmith')).toBeNull();
    expect(validateUsername('coffee123')).toBeNull();
  });

  it('allows underscores', () => {
    expect(validateUsername('John_Smith')).toBeNull();
  });

  it('does not block a real name — validation is format-only, not an identity/anonymity gate', () => {
    expect(validateUsername('JohnSmith')).toBeNull();
    expect(validateUsername('John_Smith_2026')).toBeNull();
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateUsername('  coffee123  ')).toBeNull();
  });

  it('accepts a generated-style username (AdjectiveNounNNN)', () => {
    expect(validateUsername('BlueFalcon482')).toBeNull();
    expect(validateUsername('SilentRiver921')).toBeNull();
    expect(validateUsername('PixelTiger337')).toBeNull();
  });
});
