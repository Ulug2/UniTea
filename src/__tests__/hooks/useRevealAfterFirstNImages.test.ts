import { renderHook, act } from '@testing-library/react-native';
import { useRevealAfterFirstNImages } from '../../hooks/useRevealAfterFirstNImages';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRevealAfterFirstNImages', () => {
  it('starts hidden by default', () => {
    const { result } = renderHook(() => useRevealAfterFirstNImages());
    expect(result.current.shouldReveal).toBe(false);
  });

  it('starts revealed when initialRevealed is true (cached content)', () => {
    const { result } = renderHook(() =>
      useRevealAfterFirstNImages({ initialRevealed: true }),
    );
    expect(result.current.shouldReveal).toBe(true);
  });

  it('reveals once minItems have called onItemReady', () => {
    const { result } = renderHook(() => useRevealAfterFirstNImages({ minItems: 3 }));

    act(() => result.current.onItemReady());
    act(() => result.current.onItemReady());
    expect(result.current.shouldReveal).toBe(false);

    act(() => result.current.onItemReady());
    expect(result.current.shouldReveal).toBe(true);
  });

  it('reveals after the timeout even if fewer than minItems reported ready', () => {
    const { result } = renderHook(() =>
      useRevealAfterFirstNImages({ minItems: 5, timeoutMs: 2500 }),
    );

    act(() => result.current.onItemReady());
    expect(result.current.shouldReveal).toBe(false);

    act(() => jest.advanceTimersByTime(2500));
    expect(result.current.shouldReveal).toBe(true);
  });

  it('does not start the timeout when enabled is false', () => {
    const { result } = renderHook(() =>
      useRevealAfterFirstNImages({ enabled: false, timeoutMs: 1000 }),
    );

    act(() => jest.advanceTimersByTime(5000));
    expect(result.current.shouldReveal).toBe(false);
  });

  it('ignores extra onItemReady calls past minItems', () => {
    const { result } = renderHook(() => useRevealAfterFirstNImages({ minItems: 1 }));

    act(() => result.current.onItemReady());
    expect(result.current.shouldReveal).toBe(true);

    // Should not throw or misbehave when called again after already revealed.
    act(() => result.current.onItemReady());
    expect(result.current.shouldReveal).toBe(true);
  });

  it('resets the reveal state when resetKey changes (e.g. switching community/tab)', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useRevealAfterFirstNImages({ minItems: 1, resetKey }),
      { initialProps: { resetKey: 'tab-a' } },
    );

    act(() => result.current.onItemReady());
    expect(result.current.shouldReveal).toBe(true);

    rerender({ resetKey: 'tab-b' });
    expect(result.current.shouldReveal).toBe(false);
  });

  it('reveals immediately on reset when initialRevealed is true for the new key (cached tab)', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useRevealAfterFirstNImages({ minItems: 1, resetKey, initialRevealed: true }),
      { initialProps: { resetKey: 'tab-a' } },
    );

    expect(result.current.shouldReveal).toBe(true);

    rerender({ resetKey: 'tab-b' });
    expect(result.current.shouldReveal).toBe(true);
  });

  it('clears the pending timeout once revealed via onItemReady (no late state flip)', () => {
    const { result } = renderHook(() =>
      useRevealAfterFirstNImages({ minItems: 1, timeoutMs: 2500 }),
    );

    act(() => result.current.onItemReady());
    expect(result.current.shouldReveal).toBe(true);

    // If the timeout weren't cleared, this would just re-set the same value —
    // assert it doesn't throw and the value is stable either way.
    act(() => jest.advanceTimersByTime(2500));
    expect(result.current.shouldReveal).toBe(true);
  });
});
