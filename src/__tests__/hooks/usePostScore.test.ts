import { renderHook, waitFor, act } from '@testing-library/react-native';
import { usePostScore } from '../../hooks/usePostScore';

jest.mock('../../utils/votes', () => ({
  getPostScore: jest.fn(),
}));

import { getPostScore } from '../../utils/votes';

const mockGetPostScore = getPostScore as jest.Mock;

describe('usePostScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── initial state ─────────────────────────────────────────────────────────
  it('returns 0 as the initial score before any async resolution', () => {
    // Make getPostScore never resolve for this test
    mockGetPostScore.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePostScore('post-1'));
    expect(result.current).toBe(0);
  });

  // ── empty postId guard ────────────────────────────────────────────────────
  describe('when postId is empty', () => {
    it('does not call getPostScore', () => {
      const { result } = renderHook(() => usePostScore(''));
      expect(mockGetPostScore).not.toHaveBeenCalled();
      expect(result.current).toBe(0);
    });
  });

  // ── happy path ────────────────────────────────────────────────────────────
  describe('when getPostScore resolves', () => {
    it('updates score to the resolved value', async () => {
      mockGetPostScore.mockResolvedValue(42);

      const { result } = renderHook(() => usePostScore('post-abc'));

      await waitFor(() => expect(result.current).toBe(42));
      expect(mockGetPostScore).toHaveBeenCalledWith('post-abc');
    });

    it('starts at 0 before resolving', async () => {
      let resolveScore: (v: number) => void;
      const lazyPromise = new Promise<number>((res) => { resolveScore = res; });
      mockGetPostScore.mockReturnValue(lazyPromise);

      const { result } = renderHook(() => usePostScore('post-lazy'));
      expect(result.current).toBe(0);

      await act(async () => { resolveScore!(99); });
      await waitFor(() => expect(result.current).toBe(99));
    });
  });

  // ── isMounted guard on unmount ────────────────────────────────────────────
  describe('when the component unmounts before getPostScore resolves', () => {
    it('does not attempt to set state after unmount', async () => {
      let resolveScore: (v: number) => void;
      const lazyPromise = new Promise<number>((res) => { resolveScore = res; });
      mockGetPostScore.mockReturnValue(lazyPromise);

      const { result, unmount } = renderHook(() => usePostScore('post-unmount'));

      expect(result.current).toBe(0);
      unmount();

      // Resolve after unmount — should not throw / trigger state update
      await act(async () => { resolveScore!(77); });

      // Score must still be 0 (isMounted flag prevented setState)
      expect(result.current).toBe(0);
    });
  });

  // ── postId change re-fetches ──────────────────────────────────────────────
  describe('when postId changes', () => {
    it('fetches again with the new postId', async () => {
      mockGetPostScore.mockResolvedValueOnce(10).mockResolvedValueOnce(20);

      const { result, rerender } = renderHook(
        ({ id }: { id: string }) => usePostScore(id),
        { initialProps: { id: 'post-1' } },
      );

      await waitFor(() => expect(result.current).toBe(10));
      expect(mockGetPostScore).toHaveBeenCalledWith('post-1');

      rerender({ id: 'post-2' });

      await waitFor(() => expect(result.current).toBe(20));
      expect(mockGetPostScore).toHaveBeenCalledWith('post-2');
      expect(mockGetPostScore).toHaveBeenCalledTimes(2);
    });

    it('does not re-fetch when postId changes to empty string', () => {
      mockGetPostScore.mockResolvedValue(5);

      const { rerender } = renderHook(
        ({ id }: { id: string }) => usePostScore(id),
        { initialProps: { id: '' } },
      );

      rerender({ id: '' });

      expect(mockGetPostScore).not.toHaveBeenCalled();
    });
  });
});
