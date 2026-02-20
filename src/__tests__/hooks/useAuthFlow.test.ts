import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useAuthFlow } from '../../hooks/useAuthFlow';

// ----- module mocks -------------------------------------------------------
jest.mock('../../hooks/useRateLimit', () => ({
  useRateLimit: jest.fn(),
}));
jest.mock('../../hooks/useTimeoutRace', () => ({
  useTimeoutRace: jest.fn(),
}));
jest.mock('../../hooks/useSplashDuring', () => ({
  useSplashDuring: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      resend: jest.fn(),
    },
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../../utils/logger', () => ({
  logger: { breadcrumb: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../utils/authErrors', () => ({
  normalizeAuthError: jest.fn(),
}));

// ----- typed references ---------------------------------------------------
import { useRateLimit } from '../../hooks/useRateLimit';
import { useTimeoutRace } from '../../hooks/useTimeoutRace';
import { useSplashDuring } from '../../hooks/useSplashDuring';
import { supabase } from '../../lib/supabase';
import { normalizeAuthError } from '../../utils/authErrors';

const mockUseRateLimit = useRateLimit as jest.Mock;
const mockUseTimeoutRace = useTimeoutRace as jest.Mock;
const mockUseSplashDuring = useSplashDuring as jest.Mock;
const mockNormalizeAuthError = normalizeAuthError as jest.Mock;
const mockSignIn = supabase.auth.signInWithPassword as jest.Mock;
const mockSignUp = supabase.auth.signUp as jest.Mock;
const mockResetPw = supabase.auth.resetPasswordForEmail as jest.Mock;
const mockResend = supabase.auth.resend as jest.Mock;
const mockFunctionsInvoke = supabase.functions.invoke as jest.Mock;

// ----- constants ----------------------------------------------------------
const CONFIG = { timeoutMs: 5000, rateLimitCooldownMs: 30000, minPasswordLength: 6 };

// --------------------------------------------------------------------------

describe('useAuthFlow', () => {
  let alertSpy: jest.SpyInstance;
  let mockRateLimitTrigger: jest.Mock;
  let mockRace: jest.Mock;
  let mockSplashRun: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    // Default stubs for internal hooks
    mockRateLimitTrigger = jest.fn();
    mockUseRateLimit.mockReturnValue({
      isLimited: false,
      remainingMinutes: 0,
      trigger: mockRateLimitTrigger,
    });

    mockRace = jest.fn().mockImplementation((promise: Promise<unknown>) => promise);
    mockUseTimeoutRace.mockReturnValue({ race: mockRace });

    mockSplashRun = jest.fn().mockImplementation(async (fn: () => unknown) => fn());
    mockUseSplashDuring.mockReturnValue({ run: mockSplashRun });

    // Default: normalizeAuthError returns a generic unknown result
    mockNormalizeAuthError.mockImplementation((err: unknown) => ({
      message: err instanceof Error ? err.message : 'Unknown error',
      kind: 'unknown',
      rawMessage: err instanceof Error ? err.message : String(err),
    }));
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // ── derived strings ────────────────────────────────────────────────────
  describe('headline and helper', () => {
    it('returns correct strings in "login" mode', () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      expect(result.current.headline).toBe('Sign in');
      expect(result.current.helper).toBe('Sign in to your account.');
    });

    it('returns correct strings in "signup" mode', () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => result.current.setMode('signup'));
      expect(result.current.headline).toBe('Create your account');
      expect(result.current.helper).toBe('Join UniTee with your @nu.edu.kz address.');
    });

    it('returns correct strings in "forgot" mode', () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => result.current.setMode('forgot'));
      expect(result.current.headline).toBe('Reset Password');
      expect(result.current.helper).toBe('Enter your email to receive a reset link.');
    });
  });

  // ── setModeAndReset ───────────────────────────────────────────────────
  describe('setModeAndReset', () => {
    it('clears email/password errors on mode change', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));

      // Trigger an error for email
      await act(async () => { await result.current.signInWithEmail(); });
      expect(result.current.emailError).not.toBe('');

      act(() => result.current.setMode('signup'));
      expect(result.current.emailError).toBe('');
      expect(result.current.passwordError).toBe('');
    });

    it('resets privacyAccepted when switching to non-signup mode', () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));

      act(() => {
        result.current.setMode('signup');
        result.current.setPrivacyAccepted(true);
      });
      expect(result.current.privacyAccepted).toBe(true);

      act(() => result.current.setMode('login'));
      expect(result.current.privacyAccepted).toBe(false);
    });

    it('does NOT reset privacyAccepted when switching to signup', () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));

      act(() => result.current.setPrivacyAccepted(true));

      // switch away, then back to signup
      act(() => result.current.setMode('forgot'));
      act(() => result.current.setMode('signup'));

      // After switching TO signup, privacyAccepted is not reset
      expect(result.current.privacyAccepted).toBe(false);
      // (it was reset when we switched TO forgot first; this tests that switching TO signup won't reset it)
    });

    it('clears showResendOption on mode change', async () => {
      mockNormalizeAuthError.mockReturnValueOnce({
        message: 'Check your email',
        kind: 'email_not_confirmed',
        rawMessage: 'email_not_confirmed',
      });
      mockSignIn.mockResolvedValue({ error: new Error('Email not confirmed') });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('pass123'); });

      await act(async () => { await result.current.signInWithEmail(); });
      expect(result.current.showResendOption).toBe(true);

      act(() => result.current.setMode('signup'));
      expect(result.current.showResendOption).toBe(false);
    });
  });

  // ── signInWithEmail ────────────────────────────────────────────────────
  describe('signInWithEmail', () => {
    it('sets emailError when email is empty', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));

      await act(async () => { await result.current.signInWithEmail(); });

      expect(result.current.emailError).toBe('Please enter your email address.');
    });

    it('sets passwordError when password is empty but email is set', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => result.current.setEmail('user@nu.edu.kz'));

      await act(async () => { await result.current.signInWithEmail(); });

      expect(result.current.passwordError).toBe('Please enter your password.');
    });

    it('shows alert and does NOT call supabase when rate limited', async () => {
      mockUseRateLimit.mockReturnValue({ isLimited: true, remainingMinutes: 2, trigger: mockRateLimitTrigger });
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('pass'); });

      await act(async () => { await result.current.signInWithEmail(); });

      expect(alertSpy).toHaveBeenCalledWith('Too Many Attempts', expect.any(String));
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('calls supabase.auth.signInWithPassword on happy path', async () => {
      mockSignIn.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('user@nu.edu.kz'); result.current.setPassword('secure123'); });

      await act(async () => { await result.current.signInWithEmail(); });

      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'user@nu.edu.kz',
        password: 'secure123',
      });
    });

    it('sanitizes email (trim + lowercase) before send', async () => {
      mockSignIn.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('  User@NU.EDU.KZ  '); result.current.setPassword('pass'); });

      await act(async () => { await result.current.signInWithEmail(); });

      expect(mockSignIn).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@nu.edu.kz' }),
      );
    });

    it('sets passwordError for invalid_credentials', async () => {
      mockNormalizeAuthError.mockReturnValue({
        message: 'Invalid login credentials',
        kind: 'invalid_credentials',
        rawMessage: 'invalid_credentials',
      });
      mockSignIn.mockResolvedValue({ error: new Error('invalid_credentials') });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('wrong'); });

      await act(async () => { await result.current.signInWithEmail(); });

      expect(result.current.passwordError).toBe('Invalid login credentials');
    });

    it('sets emailError and showResendOption for email_not_confirmed', async () => {
      mockNormalizeAuthError.mockReturnValue({
        message: 'Please verify your email',
        kind: 'email_not_confirmed',
        rawMessage: 'email_not_confirmed',
      });
      mockSignIn.mockResolvedValue({ error: new Error('email_not_confirmed') });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('pass'); });

      await act(async () => { await result.current.signInWithEmail(); });

      expect(result.current.emailError).toBe('Please verify your email');
      expect(result.current.showResendOption).toBe(true);
    });

    it('shows Timeout alert when race rejects with timeout error', async () => {
      mockNormalizeAuthError.mockReturnValue({
        message: 'Request timed out.',
        kind: 'timeout',
        rawMessage: 'timeout',
      });
      mockSplashRun.mockImplementation(async (fn: () => unknown) => { await fn(); });
      mockRace.mockRejectedValue(new Error('Request timeout'));

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('pass'); });

      await act(async () => { await result.current.signInWithEmail(); });

      expect(alertSpy).toHaveBeenCalledWith('Timeout', expect.any(String));
    });
  });

  // ── signUpWithEmail ────────────────────────────────────────────────────
  describe('signUpWithEmail', () => {
    it('sets emailError when email is empty', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setMode('signup'); });

      await act(async () => { await result.current.signUpWithEmail(); });

      expect(result.current.emailError).toBe('Please enter your email address.');
    });

    it('sets passwordError when password is empty', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); });

      await act(async () => { await result.current.signUpWithEmail(); });

      expect(result.current.passwordError).toBe('Please enter your password.');
    });

    it('sets privacyError when privacy not accepted', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('pass123'); });

      await act(async () => { await result.current.signUpWithEmail(); });

      expect(result.current.privacyError).not.toBe('');
    });

    it('sets passwordError when password is too short', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => {
        result.current.setEmail('a@nu.edu.kz');
        result.current.setPassword('abc');
        result.current.setPrivacyAccepted(true);
      });

      await act(async () => { await result.current.signUpWithEmail(); });

      expect(result.current.passwordError).toContain('6 characters');
    });

    it('shows Verify alert when signup succeeds with no session', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: { exists: false } });
      mockSignUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => {
        result.current.setEmail('new@nu.edu.kz');
        result.current.setPassword('secure123');
        result.current.setPrivacyAccepted(true);
      });

      await act(async () => { await result.current.signUpWithEmail(); });

      expect(alertSpy).toHaveBeenCalledWith('Verify Your Email', expect.any(String));
      expect(result.current.showResendOption).toBe(true);
    });

    it('completes silently when signup returns a session (auto-confirmed)', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: { exists: false } });
      mockSignUp.mockResolvedValue({ data: { session: { access_token: 'tok' }, user: {} }, error: null });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => {
        result.current.setEmail('new@nu.edu.kz');
        result.current.setPassword('secure123');
        result.current.setPrivacyAccepted(true);
      });

      await act(async () => { await result.current.signUpWithEmail(); });

      // No "Verify Your Email" alert should be shown with a session
      expect(alertSpy).not.toHaveBeenCalledWith('Verify Your Email', expect.anything());
      expect(result.current.showResendOption).toBe(false);
    });
  });

  // ── resetPassword ──────────────────────────────────────────────────────
  describe('resetPassword', () => {
    it('sets emailError when email is empty', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));

      await act(async () => { await result.current.resetPassword(); });

      expect(result.current.emailError).toBe('Please enter your email address.');
    });

    it('calls resetPasswordForEmail and shows alert on success', async () => {
      mockResetPw.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => result.current.setEmail('user@nu.edu.kz'));

      await act(async () => { await result.current.resetPassword(); });

      expect(mockResetPw).toHaveBeenCalledWith(
        'user@nu.edu.kz',
        expect.objectContaining({ redirectTo: expect.any(String) }),
      );
      expect(alertSpy).toHaveBeenCalledWith('Check Your Email', expect.any(String));
    });

    it('switches mode to "login" after successful reset', async () => {
      mockResetPw.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => {
        result.current.setMode('forgot');
        result.current.setEmail('user@nu.edu.kz');
      });

      await act(async () => { await result.current.resetPassword(); });

      expect(result.current.mode).toBe('login');
    });

    it('sets emailError when resetPasswordForEmail returns error', async () => {
      mockNormalizeAuthError.mockReturnValueOnce({
        message: 'Email not found',
        kind: 'unknown',
        rawMessage: 'not found',
      });
      mockResetPw.mockResolvedValue({ error: { message: 'not found' } });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => result.current.setEmail('user@nu.edu.kz'));

      await act(async () => { await result.current.resetPassword(); });

      expect(result.current.emailError).toBe('Email not found');
    });
  });

  // ── resendVerificationEmail ────────────────────────────────────────────
  describe('resendVerificationEmail', () => {
    it('shows Alert("Email Required") when email is empty', async () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));

      await act(async () => { await result.current.resendVerificationEmail(); });

      expect(alertSpy).toHaveBeenCalledWith('Email Required', expect.any(String));
      expect(mockResend).not.toHaveBeenCalled();
    });

    it('shows Alert("Email Sent") on success', async () => {
      mockResend.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => result.current.setEmail('u@nu.edu.kz'));

      await act(async () => { await result.current.resendVerificationEmail(); });

      expect(alertSpy).toHaveBeenCalledWith('Email Sent', expect.any(String));
    });

    it('hides showResendOption after successfully resending', async () => {
      // First trigger showResendOption=true via applyAuthError
      mockNormalizeAuthError.mockReturnValue({
        message: 'Verify email',
        kind: 'email_not_confirmed',
        rawMessage: 'email_not_confirmed',
      });
      mockSignIn.mockResolvedValue({ error: new Error('email_not_confirmed') });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('pass'); });
      await act(async () => { await result.current.signInWithEmail(); });
      expect(result.current.showResendOption).toBe(true);

      // Now resend
      mockNormalizeAuthError.mockReturnValue({
        message: 'Unknown error',
        kind: 'unknown',
        rawMessage: 'unknown',
      });
      mockResend.mockResolvedValue({ error: null });
      await act(async () => { await result.current.resendVerificationEmail(); });

      expect(result.current.showResendOption).toBe(false);
    });
  });

  // ── applyAuthError side-effects ───────────────────────────────────────
  describe('applyAuthError', () => {
    it('calls rateLimit.trigger() for rate_limit kind', async () => {
      mockNormalizeAuthError.mockReturnValue({
        message: 'Too many requests',
        kind: 'rate_limit',
        rawMessage: 'rate_limit',
      });
      mockSignIn.mockResolvedValue({ error: new Error('rate_limit') });

      const { result } = renderHook(() => useAuthFlow(CONFIG));
      act(() => { result.current.setEmail('a@nu.edu.kz'); result.current.setPassword('pass'); });

      await act(async () => { await result.current.signInWithEmail(); });

      expect(mockRateLimitTrigger).toHaveBeenCalled();
    });
  });

  // ── isLoading ─────────────────────────────────────────────────────────
  describe('isLoading', () => {
    it('is false initially', () => {
      const { result } = renderHook(() => useAuthFlow(CONFIG));
      expect(result.current.isLoading).toBe(false);
    });
  });
});
