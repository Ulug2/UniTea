import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FilterProvider, useFilterContext } from '../../context/FilterContext';

const HIDDEN_POSTS_KEY = '@unitee_hidden_posts';

function wrapper({ children }: { children: React.ReactNode }) {
  return <FilterProvider>{children}</FilterProvider>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('FilterContext', () => {
  it('defaults selectedFilter to "hot" and hiddenPostIds to empty', () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper });
    expect(result.current.selectedFilter).toBe('hot');
    expect(result.current.hiddenPostIds).toEqual([]);
  });

  it('loads previously hidden posts from AsyncStorage on mount', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_KEY, JSON.stringify(['post-1', 'post-2']));

    const { result } = renderHook(() => useFilterContext(), { wrapper });

    await waitFor(() => expect(result.current.hiddenPostIds).toEqual(['post-1', 'post-2']));
  });

  it('falls back to an empty list when the stored value is not an array', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_KEY, JSON.stringify({ not: 'an array' }));

    const { result } = renderHook(() => useFilterContext(), { wrapper });

    // Give the mount effect a tick to run and settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.hiddenPostIds).toEqual([]);
  });

  it('hidePost adds the id to hiddenPostIds and persists it', async () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper });

    act(() => {
      result.current.hidePost('post-42');
    });

    expect(result.current.hiddenPostIds).toEqual(['post-42']);
    await waitFor(async () => {
      const stored = await AsyncStorage.getItem(HIDDEN_POSTS_KEY);
      expect(JSON.parse(stored ?? '[]')).toEqual(['post-42']);
    });
  });

  it('hidePost is idempotent — hiding the same post twice does not duplicate it', () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper });

    act(() => {
      result.current.hidePost('post-1');
    });
    act(() => {
      result.current.hidePost('post-1');
    });

    expect(result.current.hiddenPostIds).toEqual(['post-1']);
  });

  it('setSelectedFilter updates the active filter', () => {
    const { result } = renderHook(() => useFilterContext(), { wrapper });

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
});
