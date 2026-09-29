/**
 * Tests for src/hooks/useRateLimit.ts
 *
 * This hook has no external dependencies — we control time via jest.useFakeTimers().
 */

import { renderHook, act } from '@testing-library/react-native';
import { useRateLimit } from '../../hooks/useRateLimit';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRateLimit', () => {
  // ── initial state ───────────────────────────────────────────────────────────

  it('is not limited by default', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 5000 }));

    expect(result.current.isLimited).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.remainingSeconds).toBe(0);
  });

  // ── trigger ─────────────────────────────────────────────────────────────────

  it('becomes limited immediately after trigger()', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 60_000 }));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);
  });

  it('reports correct remainingMs after trigger', () => {
    const cooldownMs = 60_000;
    const { result } = renderHook(() => useRateLimit({ cooldownMs }));

    act(() => {
      result.current.trigger();
    });

    // remainingMs should be close to cooldownMs (within 1 second margin)
    expect(result.current.remainingMs).toBeGreaterThan(cooldownMs - 1000);
    expect(result.current.remainingMs).toBeLessThanOrEqual(cooldownMs);
  });

  it('remainingSeconds rounds up correctly', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 1_500 }));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.remainingSeconds).toBe(2);
  });

  it('trigger(durationMs) overrides the default cooldown', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 60_000 }));

    act(() => {
      result.current.trigger(5_000);
    });

    expect(result.current.remainingSeconds).toBe(5);
  });

  it('unlocks on its own once the cooldown expires (no other re-render)', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 60_000 }));

    act(() => {
      result.current.trigger();
    });
    expect(result.current.isLimited).toBe(true);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current.isLimited).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.remainingSeconds).toBe(0);
  });

  it('is unlocked on the next render when the clock passed expiry before the timer fired', () => {
    const { result, rerender } = renderHook(() => useRateLimit({ cooldownMs: 60_000 }));

    act(() => {
      result.current.trigger();
    });

    // Simulates an app resumed from background: wall clock moved, timer not yet run.
    jest.setSystemTime(Date.now() + 120_000);
    rerender({});

    expect(result.current.isLimited).toBe(false);
  });

  // ── clear ───────────────────────────────────────────────────────────────────

  it('clear() removes the rate limit immediately', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 60_000 }));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);

    act(() => {
      result.current.clear();
    });

    expect(result.current.isLimited).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.remainingSeconds).toBe(0);
  });

  // ── re-trigger ──────────────────────────────────────────────────────────────

  it('re-triggering resets the cooldown timer', () => {
    const cooldownMs = 30_000;
    const { result } = renderHook(() => useRateLimit({ cooldownMs }));

    act(() => {
      result.current.trigger();
    });

    // Advance time by 20 seconds (still limited)
    act(() => {
      jest.setSystemTime(Date.now() + 20_000);
    });

    // Trigger again — should reset to full cooldown
    act(() => {
      result.current.trigger();
    });

    // Now remainingMs should be close to full cooldownMs again
    expect(result.current.remainingMs).toBeGreaterThan(cooldownMs - 1000);
  });

  // ── edge cases ──────────────────────────────────────────────────────────────

  it('remainingMs is never negative', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 1_000 }));

    act(() => {
      result.current.trigger();
      // Advance well past the cooldown
      jest.setSystemTime(Date.now() + 10_000);
    });

    expect(result.current.remainingMs).toBe(0);
  });

  it('works with very short cooldown (100ms)', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 100 }));

    expect(result.current.isLimited).toBe(false);

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);
    expect(result.current.remainingMs).toBeGreaterThan(0);
    expect(result.current.remainingMs).toBeLessThanOrEqual(100);
  });
});
