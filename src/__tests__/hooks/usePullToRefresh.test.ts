import { act, renderHook } from '@testing-library/react-native';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';

describe('usePullToRefresh', () => {
  it('is not refreshing until the user pulls', () => {
    const { result } = renderHook(() => usePullToRefresh(jest.fn().mockResolvedValue(undefined)));
    expect(result.current.refreshing).toBe(false);
  });

  it('is refreshing for exactly the duration of a user pull', async () => {
    let finish!: () => void;
    const refresh = jest.fn(() => new Promise<void>((r) => (finish = r)));
    const { result } = renderHook(() => usePullToRefresh(refresh));

    let pull!: Promise<void>;
    act(() => {
      pull = result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      await pull;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('stops refreshing even when the refresh fails', async () => {
    const { result } = renderHook(() => usePullToRefresh(jest.fn().mockRejectedValue(new Error('offline'))));
    await act(async () => {
      await result.current.onRefresh().catch(() => {});
    });
    expect(result.current.refreshing).toBe(false);
  });
});
