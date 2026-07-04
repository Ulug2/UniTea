jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
      signInWithPassword: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdatePassword } from '../../../features/profile/hooks/useUpdatePassword';
import { supabase } from '../../../lib/supabase';

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockSignIn = supabase.auth.signInWithPassword as jest.Mock;
const mockUpdateUser = supabase.auth.updateUser as jest.Mock;

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { email: 'me@nu.edu.kz' } } });
});

describe('useUpdatePassword', () => {
  it('throws and never attempts re-auth when the current user has no email on file', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: null } } });

    const { result } = renderHook(() => useUpdatePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'old', newPassword: 'New123!' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe(
      'Unable to verify identity. Please sign out and sign in again.',
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('re-authenticates with the current password before allowing any change', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useUpdatePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'oldPass1!', newPassword: 'NewPass1!' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'me@nu.edu.kz',
      password: 'oldPass1!',
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewPass1!' });
  });

  it('throws "Incorrect current password" and never calls updateUser when re-auth fails', async () => {
    mockSignIn.mockResolvedValue({ error: new Error('invalid_credentials') });

    const { result } = renderHook(() => useUpdatePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'wrongPass', newPassword: 'NewPass1!' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe(
      'Incorrect current password. Please try again.',
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('propagates the underlying error when updateUser fails after successful re-auth', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    const updateError = new Error('Password is too weak');
    mockUpdateUser.mockResolvedValue({ error: updateError });

    const { result } = renderHook(() => useUpdatePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'oldPass1!', newPassword: 'weak' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(updateError);
  });
});
