/**
 * Tests for src/utils/passwordValidation.ts — the shared live-validation
 * logic behind Sign Up, Change Password, and Reset Password.
 */
import {
  getPasswordRequirements,
  isPasswordValid,
  MIN_PASSWORD_LENGTH,
} from '../../utils/passwordValidation';

describe('getPasswordRequirements', () => {
  it('marks every requirement unmet for an empty password', () => {
    const reqs = getPasswordRequirements('');
    expect(reqs.every((r) => !r.met)).toBe(true);
  });

  it('marks length met once the password reaches MIN_PASSWORD_LENGTH', () => {
    const short = getPasswordRequirements('a'.repeat(MIN_PASSWORD_LENGTH - 1));
    const exact = getPasswordRequirements('a'.repeat(MIN_PASSWORD_LENGTH));
    expect(short.find((r) => r.key === 'length')!.met).toBe(false);
    expect(exact.find((r) => r.key === 'length')!.met).toBe(true);
  });

  it('detects uppercase, lowercase, number, and symbol independently', () => {
    const reqs = getPasswordRequirements('Abc123!@');
    expect(reqs.find((r) => r.key === 'uppercase')!.met).toBe(true);
    expect(reqs.find((r) => r.key === 'lowercase')!.met).toBe(true);
    expect(reqs.find((r) => r.key === 'number')!.met).toBe(true);
    expect(reqs.find((r) => r.key === 'symbol')!.met).toBe(true);
  });

  it('does not count a purely alphanumeric password as having a symbol', () => {
    const reqs = getPasswordRequirements('Abcdefg1');
    expect(reqs.find((r) => r.key === 'symbol')!.met).toBe(false);
  });

  it('omits the "match" requirement when checkMatch is not set', () => {
    const reqs = getPasswordRequirements('Abc123!@', { confirmPassword: 'different' });
    expect(reqs.find((r) => r.key === 'match')).toBeUndefined();
  });

  it('includes "match" and marks it met only when passwords are equal and non-empty', () => {
    const mismatched = getPasswordRequirements('Abc123!@', {
      checkMatch: true,
      confirmPassword: 'Different1!',
    });
    const matched = getPasswordRequirements('Abc123!@', {
      checkMatch: true,
      confirmPassword: 'Abc123!@',
    });
    const bothEmpty = getPasswordRequirements('', { checkMatch: true, confirmPassword: '' });

    expect(mismatched.find((r) => r.key === 'match')!.met).toBe(false);
    expect(matched.find((r) => r.key === 'match')!.met).toBe(true);
    // Two empty strings are trivially "equal" but shouldn't read as a match —
    // there's nothing to match yet.
    expect(bothEmpty.find((r) => r.key === 'match')!.met).toBe(false);
  });
});

describe('isPasswordValid', () => {
  it('is false when any requirement is unmet', () => {
    expect(isPasswordValid('short')).toBe(false); // too short, no upper/number/symbol
    expect(isPasswordValid('alllowercase1!')).toBe(false); // no uppercase
    expect(isPasswordValid('ALLUPPERCASE1!')).toBe(false); // no lowercase
    expect(isPasswordValid('NoNumbers!')).toBe(false); // no number
    expect(isPasswordValid('NoSymbols123')).toBe(false); // no symbol
  });

  it('is true when every requirement is met', () => {
    expect(isPasswordValid('Valid123!')).toBe(true);
  });

  it('factors the match requirement into overall validity when checkMatch is set', () => {
    expect(
      isPasswordValid('Valid123!', { checkMatch: true, confirmPassword: 'Valid123!' }),
    ).toBe(true);
    expect(
      isPasswordValid('Valid123!', { checkMatch: true, confirmPassword: 'Mismatch1!' }),
    ).toBe(false);
  });

  it('ignores the confirmPassword field entirely when checkMatch is not set', () => {
    expect(isPasswordValid('Valid123!', { confirmPassword: 'totally different' })).toBe(true);
  });
});
