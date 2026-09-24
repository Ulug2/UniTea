/**
 * Tests for src/app/(auth)/callback.tsx — the email verification landing
 * screen. This is the final step of signup: if it silently fails, a user who
 * successfully signed up can never get into the app.
 */
const mockUseLocalSearchParams = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args) },
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import EmailCallbackScreen from '../../../app/(auth)/callback';
import { supabase } from '../../../lib/supabase';

const mockExchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const LINK_USED_OR_EXPIRED =
  "This link has already been used or has expired. If your email is already verified, just sign in. Otherwise, sign in to request a new link.";
const VERIFIED_SIGN_IN = 'Your email is verified. Please sign in to continue.';
const mockSetSession = supabase.auth.setSession as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EmailCallbackScreen', () => {
  it('shows the "Signing you in…" state while the exchange is still pending', () => {
    mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' });
    mockExchange.mockReturnValue(new Promise(() => {})); // never resolves within this test

    render(<EmailCallbackScreen />);

    expect(screen.getByText('Signing you in…')).toBeTruthy();
  });

  describe('error params from the link itself', () => {
    it('shows the used-or-expired message (not the raw Supabase text) and never calls supabase', async () => {
      mockUseLocalSearchParams.mockReturnValue({
        error: 'access_denied',
        error_code: 'otp_expired',
        error_description: 'Email link is invalid or has expired',
      });

      render(<EmailCallbackScreen />);

      await waitFor(() => expect(screen.getByText(LINK_USED_OR_EXPIRED)).toBeTruthy());
      expect(screen.getByText('Email link problem')).toBeTruthy();
      expect(screen.queryByText('Email link is invalid or has expired')).toBeNull();
      expect(mockExchange).not.toHaveBeenCalled();
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('shows the same message when only error is present', async () => {
      mockUseLocalSearchParams.mockReturnValue({ error: 'access_denied' });

      render(<EmailCallbackScreen />);

      await waitFor(() => expect(screen.getByText(LINK_USED_OR_EXPIRED)).toBeTruthy());
    });
  });

  describe('PKCE code exchange path', () => {
    it('navigates to the protected tabs on a successful exchange', async () => {
      mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' });
      mockExchange.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });

      render(<EmailCallbackScreen />);

      await waitFor(() =>
        expect(mockRouterReplace).toHaveBeenCalledWith('/(protected)/(tabs)'),
      );
      expect(mockExchange).toHaveBeenCalledWith('abc123');
    });

    it('tells the user they are verified and should sign in when the exchange fails (e.g. opened on another device)', async () => {
      mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' });
      mockExchange.mockResolvedValue({ data: null, error: new Error('invalid code') });

      render(<EmailCallbackScreen />);

      await waitFor(() =>
        expect(
          screen.getByText(VERIFIED_SIGN_IN),
        ).toBeTruthy(),
      );
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it('shows an inline error when the exchange returns neither a session nor an error', async () => {
      mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' });
      mockExchange.mockResolvedValue({ data: null, error: null });

      render(<EmailCallbackScreen />);

      await waitFor(() =>
        expect(
          screen.getByText(VERIFIED_SIGN_IN),
        ).toBeTruthy(),
      );
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it('shows an inline error when exchangeCodeForSession throws', async () => {
      mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' });
      mockExchange.mockRejectedValue(new Error('network down'));

      render(<EmailCallbackScreen />);

      await waitFor(() =>
        expect(
          screen.getByText(VERIFIED_SIGN_IN),
        ).toBeTruthy(),
      );
    });
  });

  describe('legacy access_token/refresh_token path', () => {
    it('shows the used-or-expired message when code and tokens are missing, without calling supabase', async () => {
      mockUseLocalSearchParams.mockReturnValue({});

      render(<EmailCallbackScreen />);

      await waitFor(() =>
        expect(
          screen.getByText(LINK_USED_OR_EXPIRED),
        ).toBeTruthy(),
      );
      expect(mockExchange).not.toHaveBeenCalled();
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('navigates to the protected tabs when setSession succeeds', async () => {
      mockUseLocalSearchParams.mockReturnValue({
        access_token: 'at',
        refresh_token: 'rt',
      });
      mockSetSession.mockResolvedValue({ data: { session: { access_token: 'at' } }, error: null });

      render(<EmailCallbackScreen />);

      await waitFor(() =>
        expect(mockRouterReplace).toHaveBeenCalledWith('/(protected)/(tabs)'),
      );
      expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    });

    it('shows an inline error when setSession fails', async () => {
      mockUseLocalSearchParams.mockReturnValue({
        access_token: 'at',
        refresh_token: 'rt',
      });
      mockSetSession.mockResolvedValue({ data: null, error: new Error('bad token') });

      render(<EmailCallbackScreen />);

      await waitFor(() =>
        expect(
          screen.getByText(VERIFIED_SIGN_IN),
        ).toBeTruthy(),
      );
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });

  describe('"Back to sign in" recovery', () => {
    it('navigates to (auth) when tapped from the error state', async () => {
      mockUseLocalSearchParams.mockReturnValue({ error: 'access_denied' });

      render(<EmailCallbackScreen />);

      await waitFor(() => expect(screen.getByText('Back to sign in')).toBeTruthy());
      fireEvent.press(screen.getByText('Back to sign in'));

      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)');
    });
  });
});
