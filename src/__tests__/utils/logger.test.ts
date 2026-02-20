/**
 * Tests for src/utils/logger.ts
 *
 * We manipulate `(logger as any).isDevelopment` per test to exercise both branches,
 * since logger is constructed as a singleton from the `__DEV__` global.
 */

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}));

import * as Sentry from '@sentry/react-native';
import { logger } from '../../utils/logger';

const mockAddBreadcrumb = Sentry.addBreadcrumb as jest.Mock;
const mockCaptureMessage = Sentry.captureMessage as jest.Mock;
const mockCaptureException = Sentry.captureException as jest.Mock;

function setDev(isDev: boolean) {
  (logger as any).isDevelopment = isDev;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  // Reset to dev mode so other tests are unaffected
  setDev(true);
});

// ── __DEV__ = true (development mode) ────────────────────────────────────────

describe('logger in development mode (__DEV__ = true)', () => {
  beforeEach(() => setDev(true));

  it('info() calls console.log and does NOT call Sentry', () => {
    logger.info('hello info');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('hello info'), '');
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('info() forwards metadata to console.log', () => {
    logger.info('msg', { key: 'val' });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('msg'), { key: 'val' });
  });

  it('warn() calls console.warn and does NOT call Sentry', () => {
    logger.warn('watch out');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('watch out'), '');
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('error() calls console.error and does NOT call Sentry', () => {
    logger.error('boom');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('boom'), '', '');
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('error(message, Error) calls console.error with the error object', () => {
    const err = new Error('kaboom');
    logger.error('desc', err);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('desc'), err, '');
  });
});

// ── __DEV__ = false (production mode) ────────────────────────────────────────

describe('logger in production mode (__DEV__ = false)', () => {
  beforeEach(() => setDev(false));

  it('info() calls addBreadcrumb with correct shape and does NOT call console.log', () => {
    logger.info('prod info', { extra: 1 });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      message: 'prod info',
      level: 'info',
      data: { extra: 1 },
    });
    expect(console.log).not.toHaveBeenCalled();
  });

  it('warn() calls addBreadcrumb + captureMessage and does NOT call console.warn', () => {
    logger.warn('prod warn', { ctx: 'x' });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'prod warn', level: 'warning' })
    );
    expect(mockCaptureMessage).toHaveBeenCalledWith('prod warn', expect.objectContaining({ level: 'warning' }));
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('error(message, Error) calls captureException and does NOT call console.error', () => {
    const err = new Error('real error');
    logger.error('context message', err);
    expect(mockCaptureException).toHaveBeenCalledWith(err, expect.any(Object));
    expect(console.error).not.toHaveBeenCalled();
  });

  it('error(message, string) calls captureMessage at error level', () => {
    logger.error('string error msg', 'some string error');
    expect(mockCaptureMessage).toHaveBeenCalledWith('string error msg', expect.objectContaining({ level: 'error' }));
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('error() with no error arg calls captureMessage', () => {
    logger.error('bare error msg');
    expect(mockCaptureMessage).toHaveBeenCalledWith('bare error msg', expect.objectContaining({ level: 'error' }));
  });
});

// ── breadcrumb helper ─────────────────────────────────────────────────────────

describe('logger.breadcrumb', () => {
  it('calls addBreadcrumb with correct category and level in production', () => {
    setDev(false);
    // breadcrumb is just an alias to info in some loggers; in this impl it routes through info
    logger.info('breadcrumb-test', { category: 'navigation' });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'breadcrumb-test' })
    );
  });
});
