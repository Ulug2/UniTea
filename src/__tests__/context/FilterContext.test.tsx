import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FilterProvider, useFilterContext } from '../../context/FilterContext';

const HIDDEN_POSTS_KEY_PREFIX = '@unitee_hidden_posts:';

function wrapperFor(userId?: string) {
  return function wrapper({ children }: { children: React.ReactNode }) {
    return <FilterProvider userId={userId}>{children}</FilterProvider>;
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('FilterContext', () => {
  it('defaults selectedFilter to "hot" and hiddenPostIds to empty', () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-1') });
    expect(result.current.selectedFilter).toBe('hot');
    expect(result.current.hiddenPostIds).toEqual([]);
  });

  it('loads previously hidden posts from AsyncStorage on mount, scoped to the given userId', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_KEY_PREFIX + 'user-1', JSON.stringify(['post-1', 'post-2']));

    const { result } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-1') });

    await waitFor(() => expect(result.current.hiddenPostIds).toEqual(['post-1', 'post-2']));
  });

  it('falls back to an empty list when the stored value is not an array', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_KEY_PREFIX + 'user-1', JSON.stringify({ not: 'an array' }));

    const { result } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-1') });

    // Give the mount effect a tick to run and settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.hiddenPostIds).toEqual([]);
  });

  it('hidePost adds the id to hiddenPostIds and persists it under a userId-scoped key', async () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-1') });

    act(() => {
      result.current.hidePost('post-42');
    });

    expect(result.current.hiddenPostIds).toEqual(['post-42']);
    await waitFor(async () => {
      const stored = await AsyncStorage.getItem(HIDDEN_POSTS_KEY_PREFIX + 'user-1');
      expect(JSON.parse(stored ?? '[]')).toEqual(['post-42']);
    });
  });

  it('hidePost is idempotent — hiding the same post twice does not duplicate it', () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-1') });

    act(() => {
      result.current.hidePost('post-1');
    });
    act(() => {
      result.current.hidePost('post-1');
    });

    expect(result.current.hiddenPostIds).toEqual(['post-1']);
  });

  it('setSelectedFilter updates the active filter', () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-1') });

    act(() => {
      result.current.setSelectedFilter('top');
    });

    expect(result.current.selectedFilter).toBe('top');
  });

  it('useFilterContext outside a provider falls back to safe no-op defaults', () => {
    const { result } = renderHook(() => useFilterContext());
    expect(result.current.selectedFilter).toBe('hot');
    expect(result.current.hiddenPostIds).toEqual([]);
    // Should not throw when called without a provider.
    expect(() => result.current.hidePost('x')).not.toThrow();
  });

  // Phase 8 — cross-account isolation (the actual fix under test)
  it('without a userId (e.g. signed out), hiddenPostIds stays empty and hidePost is a no-op', async () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper: wrapperFor(undefined) });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.hiddenPostIds).toEqual([]);

    act(() => {
      result.current.hidePost('post-1');
    });
    expect(result.current.hiddenPostIds).toEqual([]);
  });

  it('two different users on the same device never see each other\'s hidden-post list', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_KEY_PREFIX + 'user-A', JSON.stringify(['post-a']));
    await AsyncStorage.setItem(HIDDEN_POSTS_KEY_PREFIX + 'user-B', JSON.stringify(['post-b']));

    const { result: resultA } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-A') });
    await waitFor(() => expect(resultA.current.hiddenPostIds).toEqual(['post-a']));

    const { result: resultB } = renderHook(() => useFilterContext(), { wrapper: wrapperFor('user-B') });
    await waitFor(() => expect(resultB.current.hiddenPostIds).toEqual(['post-b']));

    // Confirm neither list leaked into the other's storage key.
    const storedA = await AsyncStorage.getItem(HIDDEN_POSTS_KEY_PREFIX + 'user-A');
    const storedB = await AsyncStorage.getItem(HIDDEN_POSTS_KEY_PREFIX + 'user-B');
    expect(JSON.parse(storedA ?? '[]')).toEqual(['post-a']);
    expect(JSON.parse(storedB ?? '[]')).toEqual(['post-b']);
  });
});
