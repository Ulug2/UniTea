import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontScaleProvider, useFontScale } from '../../context/FontScaleContext';

const FONT_SCALE_STORAGE_KEY = '@unitea_font_scale_preference';

function wrapper({ children }: { children: React.ReactNode }) {
  return <FontScaleProvider>{children}</FontScaleProvider>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('FontScaleContext', () => {
  it('defaults to automatic with a multiplier of 1', () => {
    const { result } = renderHook(() => useFontScale(), { wrapper });
    expect(result.current.preference).toBe('automatic');
    expect(result.current.multiplier).toBe(1);
  });

  it('loads a previously saved preference from AsyncStorage on mount', async () => {
    await AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, 'large');

    const { result } = renderHook(() => useFontScale(), { wrapper });

    await waitFor(() => expect(result.current.preference).toBe('large'));
    expect(result.current.multiplier).toBe(1.15);
  });

  it('ignores an invalid stored value and falls back to automatic', async () => {
    await AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, 'huge');

    const { result } = renderHook(() => useFontScale(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.preference).toBe('automatic');
  });

  it('setPreference updates the preference and multiplier, and persists it', async () => {
    const { result } = renderHook(() => useFontScale(), { wrapper });

    act(() => {
      result.current.setPreference('small');
    });

    expect(result.current.preference).toBe('small');
    expect(result.current.multiplier).toBe(0.9);
    await waitFor(async () => {
      const stored = await AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY);
      expect(stored).toBe('small');
    });
  });

  it('resetToAutomatic clears the preference and removes the persisted key', async () => {
    const { result } = renderHook(() => useFontScale(), { wrapper });

    act(() => {
      result.current.setPreference('large');
    });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('large');
    });

    act(() => {
      result.current.resetToAutomatic();
    });

    expect(result.current.preference).toBe('automatic');
    expect(result.current.multiplier).toBe(1);
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBeNull();
    });
  });

  it('useFontScale outside a provider throws', () => {
    const { result } = renderHook(() => {
      try {
        return useFontScale();
      } catch (error) {
        return error;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
  });
});
