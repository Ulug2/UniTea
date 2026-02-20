/**
 * Tests for src/hooks/useSplashDuring.ts
 */

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
}));
jest.mock('../../utils/splash', () => ({
  hideSplashSafe: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import * as SplashScreen from 'expo-splash-screen';
import { renderHook, act } from '@testing-library/react-native';
import { useSplashDuring } from '../../hooks/useSplashDuring';
import { hideSplashSafe } from '../../utils/splash';
import { logger } from '../../utils/logger';

const mockPreventAutoHideAsync = SplashScreen.preventAutoHideAsync as jest.Mock;
const mockHideSplashSafe = hideSplashSafe as jest.Mock;
const mockWarn = logger.warn as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPreventAutoHideAsync.mockResolvedValue(undefined);
  mockHideSplashSafe.mockResolvedValue(undefined);
});

describe('useSplashDuring', () => {
  it('calls preventAutoHideAsync before the action', async () => {
    const { result } = renderHook(() => useSplashDuring());
    const action = jest.fn().mockResolvedValue('done');
    await act(async () => {
      await result.current.run(action);
    });
    expect(mockPreventAutoHideAsync).toHaveBeenCalled();
    expect(action).toHaveBeenCalled();
  });

  it('returns the action return value', async () => {
    const { result } = renderHook(() => useSplashDuring());
    const action = jest.fn().mockResolvedValue(42);
    let retVal: number | undefined;
    await act(async () => {
      retVal = await result.current.run(action);
    });
    expect(retVal).toBe(42);
  });

  it('logs warn and still runs action when preventAutoHideAsync throws', async () => {
    mockPreventAutoHideAsync.mockRejectedValue(new Error('cannot prevent'));
    const { result } = renderHook(() => useSplashDuring());
    const action = jest.fn().mockResolvedValue('still works');
    let retVal: string | undefined;
    await act(async () => {
      retVal = await result.current.run(action);
    });
    expect(mockWarn).toHaveBeenCalled();
    expect(action).toHaveBeenCalled();
    expect(retVal).toBe('still works');
  });

  it('calls hideSplashSafe and rethrows when action throws', async () => {
    const { result } = renderHook(() => useSplashDuring());
    const err = new Error('action blown up');
    const action = jest.fn().mockRejectedValue(err);
    await act(async () => {
      await expect(result.current.run(action)).rejects.toThrow('action blown up');
    });
    expect(mockHideSplashSafe).toHaveBeenCalled();
  });

  it('does NOT call hideSplashSafe when action succeeds', async () => {
    const { result } = renderHook(() => useSplashDuring());
    const action = jest.fn().mockResolvedValue('ok');
    await act(async () => {
      await result.current.run(action);
    });
    expect(mockHideSplashSafe).not.toHaveBeenCalled();
  });
});
