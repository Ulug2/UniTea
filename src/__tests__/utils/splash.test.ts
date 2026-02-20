/**
 * Tests for src/utils/splash.ts
 */

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import * as SplashScreen from 'expo-splash-screen';
import { logger } from '../../utils/logger';
import { hideSplashSafe } from '../../utils/splash';

const mockHideAsync = SplashScreen.hideAsync as jest.Mock;
const mockWarn = logger.warn as jest.Mock;
const mockError = logger.error as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hideSplashSafe', () => {
  it('resolves to undefined when hideAsync resolves', async () => {
    mockHideAsync.mockResolvedValue(undefined);
    await expect(hideSplashSafe()).resolves.toBeUndefined();
  });

  it('always resolves (never rejects)', async () => {
    mockHideAsync.mockRejectedValue(new Error('some failure'));
    await expect(hideSplashSafe()).resolves.toBeUndefined();
  });

  it('logs warn when hideAsync rejects with "view controller" message', async () => {
    const err = new Error('No view controller was found');
    mockHideAsync.mockRejectedValue(err);
    await hideSplashSafe();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('[Splash]'),
      expect.anything()
    );
    expect(mockError).not.toHaveBeenCalled();
  });

  it('logs warn when hideAsync rejects with "SplashScreen.show" message', async () => {
    const err = new Error("Call 'SplashScreen.show' before 'SplashScreen.hide'");
    mockHideAsync.mockRejectedValue(err);
    await hideSplashSafe();
    expect(mockWarn).toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  it('logs error when hideAsync rejects with an unknown error', async () => {
    const err = new Error('completely unexpected failure');
    mockHideAsync.mockRejectedValue(err);
    await hideSplashSafe();
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('[Splash]'),
      expect.anything()
    );
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('resolves to undefined even when error is a non-Error object', async () => {
    mockHideAsync.mockRejectedValue('string rejection');
    await expect(hideSplashSafe()).resolves.toBeUndefined();
  });
});
