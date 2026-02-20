import { renderHook, act } from '@testing-library/react-native';
import { useTimeoutRace } from '../../hooks/useTimeoutRace';

describe('useTimeoutRace', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── resolves before timeout ────────────────────────────────────────────────
  describe('when the promise resolves before the timeout', () => {
    it('returns the resolved value', async () => {
      const { result } = renderHook(() => useTimeoutRace());

      const fastPromise = Promise.resolve('hello');
      let resolved: string | undefined;

      act(() => {
        result.current.race(fastPromise, 1000).then((val) => {
          resolved = val;
        });
      });

      // Flush the microtask queue
      await act(async () => {
        await Promise.resolve();
      });

      expect(resolved).toBe('hello');
    });

    it('resolves with complex objects', async () => {
      const { result } = renderHook(() => useTimeoutRace());
      const obj = { id: 1, name: 'test' };
      const promise = Promise.resolve(obj);
      let resolved: typeof obj | undefined;

      act(() => {
        result.current.race(promise, 5000).then((val) => {
          resolved = val;
        });
      });

      await act(async () => { await Promise.resolve(); });

      expect(resolved).toEqual(obj);
    });
  });

  // ── timeout fires first ────────────────────────────────────────────────────
  describe('when the timeout fires before the promise resolves', () => {
    it('rejects with default "Request timeout" message', async () => {
      const { result } = renderHook(() => useTimeoutRace());

      // A promise that never resolves
      const neverResolves = new Promise<string>(() => {});
      let rejected: Error | undefined;

      act(() => {
        result.current.race(neverResolves, 500).catch((err) => {
          rejected = err;
        });
      });

      // Advance past the timeout
      await act(async () => {
        jest.advanceTimersByTime(600);
        await Promise.resolve();
      });

      expect(rejected).toBeInstanceOf(Error);
      expect(rejected?.message).toBe('Request timeout');
    });

    it('rejects with a custom timeout message when provided', async () => {
      const { result } = renderHook(() => useTimeoutRace());

      const neverResolves = new Promise<void>(() => {});
      let rejected: Error | undefined;

      act(() => {
        result.current.race(neverResolves, 200, 'Custom timeout msg').catch((err) => {
          rejected = err;
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(rejected?.message).toBe('Custom timeout msg');
    });

    it('does not reject before the timeout has elapsed', async () => {
      const { result } = renderHook(() => useTimeoutRace());

      const neverResolves = new Promise<void>(() => {});
      let rejected = false;

      act(() => {
        result.current.race(neverResolves, 1000).catch(() => {
          rejected = true;
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(500); // only half the timeout
        await Promise.resolve();
      });

      expect(rejected).toBe(false);
    });
  });

  // ── timer cleanup on resolve ───────────────────────────────────────────────
  describe('timer cleanup', () => {
    it('clears the timeout timer when the promise resolves first', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const { result } = renderHook(() => useTimeoutRace());

      const fastPromise = Promise.resolve(42);

      act(() => {
        result.current.race(fastPromise, 5000);
      });

      await act(async () => { await Promise.resolve(); });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('clears timers on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const { result, unmount } = renderHook(() => useTimeoutRace());

      // Start a race with a long timeout so the timer is still active
      act(() => {
        result.current.race(new Promise(() => {}), 10000).catch(() => {});
      });

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  // ── multiple concurrent races ─────────────────────────────────────────────
  describe('multiple concurrent races', () => {
    it('each race resolves independently', async () => {
      const { result } = renderHook(() => useTimeoutRace());

      const results: (string | Error)[] = [];

      act(() => {
        result.current.race(Promise.resolve('first'), 1000).then((v) => results.push(v));
        result.current.race(Promise.resolve('second'), 1000).then((v) => results.push(v));
      });

      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      expect(results).toContain('first');
      expect(results).toContain('second');
    });
  });
});
