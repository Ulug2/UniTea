/**
 * Tests for src/app/reset-password.tsx — the password-recovery completion
 * screen. This is the most security-sensitive screen in the app (it ends
 * with revoking every session on every device), so it's tested end to end
 * rather than just spot-checked.
 */
const mockUseLocalSearchParams = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args) },
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), breadcrumb: jest.fn() },
}));

jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      background: '#fff',
      card: '#fff',
      text: '#000',
      secondaryText: '#666',
      primary: '#2FC9C1',
      border: '#eee',
      error: '#EF4444',
    },
  }),
}));

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import ResetPasswordScreen from '../../app/reset-password';
import { supabase } from '../../lib/supabase';

const mockVerifyOtp = supabase.auth.verifyOtp as jest.Mock;
const mockExchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockUpdateUser = supabase.auth.updateUser as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ResetPasswordScreen', () => {
  it('shows the expired/invalid link state immediately when neither token_hash nor code is present', () => {
    mockUseLocalSearchParams.mockReturnValue({});

    render(<ResetPasswordScreen />);

    expect(screen.getByText('Link Expired or Invalid')).toBeTruthy();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockExchange).not.toHaveBeenCalled();
  });

  describe('confirm gate (defends against email-scanner prefetch)', () => {
    it('shows a confirm screen requiring an explicit tap before verifying a token_hash link', () => {
      mockUseLocalSearchParams.mockReturnValue({ token_hash: 'th-1', type: 'recovery' });

      render(<ResetPasswordScreen />);

      expect(screen.getByText('Reset Your Password')).toBeTruthy();
      expect(mockVerifyOtp).not.toHaveBeenCalled();
    });

    it('calls verifyOtp with the token_hash only after Continue is tapped', async () => {
      mockUseLocalSearchParams.mockReturnValue({ token_hash: 'th-1', type: 'recovery' });
      mockVerifyOtp.mockResolvedValue({ error: null });

      render(<ResetPasswordScreen />);
      fireEvent.press(screen.getByText('Continue'));

      await waitFor(() =>
        expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'th-1', type: 'recovery' }),
      );
      await waitFor(() => expect(screen.getByText('Set New Password')).toBeTruthy());
    });

    it('falls back to exchangeCodeForSession for a legacy ?code= link', async () => {
      mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' });
      mockExchange.mockResolvedValue({ error: null });

      render(<ResetPasswordScreen />);
      fireEvent.press(screen.getByText('Continue'));

      await waitFor(() => expect(mockExchange).toHaveBeenCalledWith('abc123'));
      expect(mockVerifyOtp).not.toHaveBeenCalled();
    });

    it('shows the expired/invalid state when verification returns an error', async () => {
      mockUseLocalSearchParams.mockReturnValue({ token_hash: 'th-1' });
      mockVerifyOtp.mockResolvedValue({ error: new Error('otp_expired') });

      render(<ResetPasswordScreen />);
      fireEvent.press(screen.getByText('Continue'));

      await waitFor(() => expect(screen.getByText('Link Expired or Invalid')).toBeTruthy());
    });

    it('shows the expired/invalid state when verification throws', async () => {
      mockUseLocalSearchParams.mockReturnValue({ token_hash: 'th-1' });
      mockVerifyOtp.mockRejectedValue(new Error('network down'));

      render(<ResetPasswordScreen />);
      fireEvent.press(screen.getByText('Continue'));

      await waitFor(() => expect(screen.getByText('Link Expired or Invalid')).toBeTruthy());
    });
  });

  describe('set new password form', () => {
    async function renderOnFormScreen() {
      mockUseLocalSearchParams.mockReturnValue({ token_hash: 'th-1' });
      mockVerifyOtp.mockResolvedValue({ error: null });
      render(<ResetPasswordScreen />);
      fireEvent.press(screen.getByText('Continue'));
      await waitFor(() => expect(screen.getByText('Set New Password')).toBeTruthy());
    }

    it('keeps Continue disabled until the password meets every requirement and matches', async () => {
      await renderOnFormScreen();

      fireEvent.changeText(screen.getByPlaceholderText('Enter new password'), 'weak');
      fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'weak');
      fireEvent.press(screen.getByText('Continue'));

      // Still on the form — updateUser must never be called with an invalid password.
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('updates the password, signs out of every device, and shows success on a valid submit', async () => {
      await renderOnFormScreen();
      mockUpdateUser.mockResolvedValue({ error: null });
      mockSignOut.mockResolvedValue({ error: null });

      fireEvent.changeText(screen.getByPlaceholderText('Enter new password'), 'NewPass123!');
      fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
      fireEvent.press(screen.getByText('Continue'));

      await waitFor(() =>
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewPass123!' }),
      );
      await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' }));
      await waitFor(() => expect(screen.getByText('Password Changed')).toBeTruthy());
    });

    it('shows an inline error and stays on the form when updateUser fails', async () => {
      await renderOnFormScreen();
      mockUpdateUser.mockResolvedValue({ error: new Error('Password reused recently') });

      fireEvent.changeText(screen.getByPlaceholderText('Enter new password'), 'NewPass123!');
      fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
      fireEvent.press(screen.getByText('Continue'));

      await waitFor(() => expect(screen.getByText('Password reused recently')).toBeTruthy());
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByText('Set New Password')).toBeTruthy();
    });

    it('shows a generic error and stays on the form when updateUser throws', async () => {
      await renderOnFormScreen();
      mockUpdateUser.mockRejectedValue(new Error('network down'));

      fireEvent.changeText(screen.getByPlaceholderText('Enter new password'), 'NewPass123!');
      fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
      fireEvent.press(screen.getByText('Continue'));

      await waitFor(() =>
        expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy(),
      );
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe('"Back to Sign In"', () => {
    it('navigates to (auth) from the confirm screen', () => {
      mockUseLocalSearchParams.mockReturnValue({ token_hash: 'th-1' });
      render(<ResetPasswordScreen />);

      fireEvent.press(screen.getByText('Back to Sign In'));
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)');
    });

    it('navigates to (auth) from the success screen', async () => {
      mockUseLocalSearchParams.mockReturnValue({ token_hash: 'th-1' });
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockUpdateUser.mockResolvedValue({ error: null });
      mockSignOut.mockResolvedValue({ error: null });

      render(<ResetPasswordScreen />);
      fireEvent.press(screen.getByText('Continue'));
      await waitFor(() => expect(screen.getByText('Set New Password')).toBeTruthy());

      fireEvent.changeText(screen.getByPlaceholderText('Enter new password'), 'NewPass123!');
      fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
      fireEvent.press(screen.getByText('Continue'));
      await waitFor(() => expect(screen.getByText('Password Changed')).toBeTruthy());

      fireEvent.press(screen.getByText('Sign In'));
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)');
    });
  });
});
