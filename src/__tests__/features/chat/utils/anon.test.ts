import { hashStringToNumber } from '../../../../features/chat/utils/anon';

describe('hashStringToNumber', () => {
  // ── range invariant ───────────────────────────────────────────────────────
  describe('range', () => {
    const cases = ['', 'a', 'abc', 'user-abc-123', 'hello world', '🎉emoji'];
    it.each(cases)('result for "%s" is within 1000–9999', (input) => {
      const result = hashStringToNumber(input);
      expect(result).toBeGreaterThanOrEqual(1000);
      expect(result).toBeLessThanOrEqual(9999);
    });
  });

  // ── determinism ───────────────────────────────────────────────────────────
  describe('determinism', () => {
    it('returns the same value every time for the same input', () => {
      const input = 'user-abc-123';
      const first = hashStringToNumber(input);
      const second = hashStringToNumber(input);
      const third = hashStringToNumber(input);
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('is deterministic for empty string', () => {
      expect(hashStringToNumber('')).toBe(hashStringToNumber(''));
    });
  });

  // ── distinctness ──────────────────────────────────────────────────────────
  describe('distinctness', () => {
    it('produces different values for clearly different inputs', () => {
      const a = hashStringToNumber('user-alice');
      const b = hashStringToNumber('user-bob');
      const c = hashStringToNumber('user-charlie');
      // All three need not be distinct in theory, but for these inputs they should be
      const unique = new Set([a, b, c]);
      expect(unique.size).toBeGreaterThan(1);
    });

    it('is case-sensitive: "abc" and "ABC" differ', () => {
      // charCodeAt differs for upper/lower — almost certain to differ
      const lower = hashStringToNumber('abcdef');
      const upper = hashStringToNumber('ABCDEF');
      expect(lower).not.toBe(upper);
    });
  });

  // ── non-negative ──────────────────────────────────────────────────────────
  it('always returns a positive integer', () => {
    const inputs = ['x', '-1', 'zzzzz', '0000000000000'];
    inputs.forEach((input) => {
      const result = hashStringToNumber(input);
      expect(result).toBeGreaterThan(0);
      expect(Number.isInteger(result)).toBe(true);
    });
  });
});
