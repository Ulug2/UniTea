/**
 * Mock for AuthContext — override mockSession in individual tests as needed.
 */
import React from 'react';
import type { Session } from '@supabase/supabase-js';

export const mockSession: { value: Session | null } = {
  value: {
    user: { id: 'test-user-id', email: 'test@uni.edu' } as any,
    access_token: 'mock-token',
  } as Session,
};

export const mockSignOut = jest.fn().mockResolvedValue(undefined);

export function useAuth() {
  return {
    session: mockSession.value,
    loading: false,
    error: null,
    signOut: mockSignOut,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}
