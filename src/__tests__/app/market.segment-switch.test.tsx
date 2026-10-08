/**
 * Market tab segment switching: a segment's list must stay mounted once
 * opened. Unmounting it destroyed its native image views, so every switch
 * back reloaded each image over an empty container (a white flash).
 */
const mockMounts: Record<string, number> = {};
const mockUnmounts: Record<string, number> = {};

jest.mock('../../components/LostFoundListItem', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: function MockItem({ postId }: { postId: string }) {
      React.useEffect(() => {
        mockMounts[postId] = (mockMounts[postId] ?? 0) + 1;
        return () => {
          mockUnmounts[postId] = (mockUnmounts[postId] ?? 0) + 1;
        };
      }, [postId]);
      return <Text>{postId}</Text>;
    },
  };
});
jest.mock('../../components/LostFoundListSkeleton', () => () => null);
jest.mock('../../components/ReportModal', () => () => null);
jest.mock('../../components/CustomInput', () => () => null);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: { background: '#fff', card: '#fff', text: '#000', secondaryText: '#666', primary: '#2FC9C1' },
  }),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('../../features/profile/hooks/useMyProfile', () => ({
  useMyProfile: () => ({ data: { is_admin: false, university_id: 'uni-1' } }),
}));
jest.mock('../../features/posts/hooks/useBlockUser', () => ({
  useBlockUser: () => ({ mutate: jest.fn() }),
}));
jest.mock('../../features/posts/hooks/useDeletePost', () => ({
  useDeletePost: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../utils/feedPersistence', () => ({ saveLostFoundToStorage: jest.fn() }));
jest.mock('../../hooks/useRevealAfterFirstNImages', () => ({
  useRevealAfterFirstNImages: () => ({ shouldReveal: true, onItemReady: jest.fn() }),
}));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import MarketScreen from '../../app/(protected)/(tabs)/lostfound';

const mockFrom = supabase.from as jest.Mock;

function postsChain(postType: string) {
  const chain: Record<string, any> = {};
  let type = postType;
  ['select', 'or', 'order'].forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  chain.eq = jest.fn((column: string, value: string) => {
    if (column === 'post_type') type = value;
    return chain;
  });
  chain.range = jest.fn(() =>
    Promise.resolve({
      data: [{ post_id: `${type}-1`, post_type: type, content: 'c', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    }),
  );
  return chain;
}

let queryClient: QueryClient;

beforeEach(() => {
  Object.keys(mockMounts).forEach((k) => delete mockMounts[k]);
  Object.keys(mockUnmounts).forEach((k) => delete mockUnmounts[k]);
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => postsChain('market'));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => queryClient.clear());

function renderScreen() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MarketScreen />
    </QueryClientProvider>,
  );
}

describe('Market tab segment switching', () => {
  it('does not mount the Lost & Found list until it is first opened', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('market-1')).toBeTruthy());

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockMounts['lost_found-1']).toBeUndefined();
  });

  it('keeps each list mounted when switching back and forth', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('market-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('market-segment-lost_found'));
    await waitFor(() => expect(mockMounts['lost_found-1']).toBe(1));
    fireEvent.press(screen.getByTestId('market-segment-market'));
    fireEvent.press(screen.getByTestId('market-segment-lost_found'));
    fireEvent.press(screen.getByTestId('market-segment-market'));

    expect(mockMounts['market-1']).toBe(1);
    expect(mockMounts['lost_found-1']).toBe(1);
    expect(mockUnmounts['market-1']).toBeUndefined();
    expect(mockUnmounts['lost_found-1']).toBeUndefined();
  });

  it('marks only the open segment as selected', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('market-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('market-segment-lost_found'));

    expect(screen.getByTestId('market-segment-lost_found').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('market-segment-market').props.accessibilityState.selected).toBe(false);
  });
});
