/**
 * Regression test for the Discover cross-university cache-contamination bug.
 *
 * Root cause: useUniversityCommunities() used to call useMyProfile() with no
 * userId argument, so its profile cache entry landed at the user-agnostic
 * key ["current-user-profile", undefined] — the one call site in the app
 * that didn't scope this key by the actual signed-in user. Because
 * AuthContext.signOut() never clears the QueryClient, switching accounts on
 * the same device/session (e.g. testing the SDU and NU admin accounts back
 * to back) served the *previous* account's cached profile — and therefore
 * its university_id — to the newly signed-in account's Discover screen,
 * which then queried the wrong university's communities entirely.
 *
 * This test proves the fix: the hook now scopes useMyProfile() by the real
 * session user id, so two different accounts sharing one long-lived
 * QueryClient (no logout clear) each resolve their own, correct
 * university_id and never see the other's community list.
 */
const mockSession: { current: { user: { id: string } } | null } = {
  current: null,
};
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ session: mockSession.current }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useUniversityCommunities } from '../../../features/communities/hooks/useUniversityCommunities';

const mockFrom = supabase.from as jest.Mock;

const SDU_ADMIN_ID = 'f2354968-618b-46a1-aaf5-d2c4373ee9e8';
const NU_ADMIN_ID = '6c920b53-4e54-41b7-80da-dec18750db5f';
const SDU_UNI_ID = '7008f8a7-95ee-4952-8a26-66509abcfc7f';
const NU_UNI_ID = '0a89ffb2-ef44-4cbc-9689-6c3e2de530ef';

const profilesById: Record<string, { id: string; university_id: string }> = {
  [SDU_ADMIN_ID]: { id: SDU_ADMIN_ID, university_id: SDU_UNI_ID },
  [NU_ADMIN_ID]: { id: NU_ADMIN_ID, university_id: NU_UNI_ID },
};

const communitiesByUniversity: Record<string, any[]> = {
  [SDU_UNI_ID]: [{ id: 'community-sdu', name: 'Hggh', university_id: SDU_UNI_ID }],
  [NU_UNI_ID]: [{ id: 'community-nu', name: 'Test', university_id: NU_UNI_ID }],
};

function profileChain(userId: string) {
  const chain: Record<string, any> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue({ data: profilesById[userId], error: null });
  return chain;
}

function communitiesChain(universityId: string) {
  const chain: Record<string, any> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.range = jest
    .fn()
    .mockResolvedValue({ data: communitiesByUniversity[universityId] ?? [], error: null });
  return chain;
}

function mockFromForUser(userId: string) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return profileChain(userId);
    if (table === 'communities') return communitiesChain(profilesById[userId].university_id);
    throw new Error(`Unexpected table: ${table}`);
  });
}

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  jest.clearAllMocks();
  // A single long-lived QueryClient across both renders below — this is
  // what makes the test meaningful: it mirrors the real app never calling
  // queryClient.clear() on sign-out, so any collision-prone cache key would
  // leak between accounts here exactly like it did in production.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});

afterEach(() => {
  queryClient.clear();
});

describe('useUniversityCommunities cross-account cache isolation', () => {
  it('resolves the correct university for the current session user, not a previously cached account', async () => {
    // Account 1: SDU admin signs in and opens Discover.
    mockSession.current = { user: { id: SDU_ADMIN_ID } };
    mockFromForUser(SDU_ADMIN_ID);

    const { result: sduResult } = renderHook(() => useUniversityCommunities(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(sduResult.current.universityId).toBe(SDU_UNI_ID));
    await waitFor(() => expect(sduResult.current.communities).toHaveLength(1));
    expect(sduResult.current.communities[0].name).toBe('Hggh');

    // Account 2: without clearing the QueryClient (no app restart, same as
    // switching accounts on one device), the NU admin signs in and opens
    // Discover. Before the fix, this would have read the SDU admin's
    // stale cached profile from the shared ["current-user-profile",
    // undefined] key and queried SDU's university_id again.
    mockSession.current = { user: { id: NU_ADMIN_ID } };
    mockFromForUser(NU_ADMIN_ID);

    const { result: nuResult } = renderHook(() => useUniversityCommunities(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(nuResult.current.universityId).toBe(NU_UNI_ID));
    await waitFor(() => expect(nuResult.current.communities).toHaveLength(1));
    expect(nuResult.current.communities[0].name).toBe('Test');

    // The SDU account's own result must remain the SDU community — proves
    // the two accounts' cache entries never collided in either direction.
    expect(sduResult.current.communities[0].name).toBe('Hggh');
  });

  it('scopes the underlying profile fetch by the real session user id (the exact line that caused the bug)', async () => {
    mockSession.current = { user: { id: SDU_ADMIN_ID } };
    mockFromForUser(SDU_ADMIN_ID);

    renderHook(() => useUniversityCommunities(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(queryClient.getQueryData(['current-user-profile', SDU_ADMIN_ID])).toBeTruthy();
    });
    // The collision-prone key must never be written to.
    expect(queryClient.getQueryData(['current-user-profile', undefined])).toBeUndefined();
  });
});
