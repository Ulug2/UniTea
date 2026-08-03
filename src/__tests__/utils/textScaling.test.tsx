import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { FontScaleContext } from '../../context/FontScaleContext';
import {
  patchGlobalTextScaling,
  __internal,
} from '../../utils/textScaling';

const { ScaledText, ScaledTextInput, applyMultiplierToStyle } = __internal;

function withMultiplier(multiplier: number) {
  return ({ children }: { children: React.ReactNode }) => (
    <FontScaleContext.Provider
      value={{
        preference: 'large',
        multiplier,
        setPreference: () => {},
        resetToAutomatic: () => {},
      }}
    >
      {children}
    </FontScaleContext.Provider>
  );
}

describe('applyMultiplierToStyle', () => {
  it('returns the style unchanged when multiplier is 1', () => {
    const style = { fontSize: 14 };
    expect(applyMultiplierToStyle(style, 1)).toBe(style);
  });

  it('multiplies fontSize when present', () => {
    const result = StyleSheet.flatten(
      applyMultiplierToStyle({ fontSize: 14, color: 'red' }, 1.15),
    );
    expect(result.fontSize).toBeCloseTo(16.1);
    expect(result.color).toBe('red');
  });

  it('leaves style unchanged when there is no numeric fontSize', () => {
    const style = { color: 'blue' };
    expect(applyMultiplierToStyle(style, 1.15)).toBe(style);
  });

  it('handles a style array (e.g. [staticStyle, dynamicOverride])', () => {
    const result = StyleSheet.flatten(
      applyMultiplierToStyle([{ fontSize: 20 }, { color: 'green' }], 0.9),
    );
    expect(result.fontSize).toBeCloseTo(18);
    expect(result.color).toBe('green');
  });
});

describe('ScaledText', () => {
  it('multiplies fontSize according to the current FontScaleContext', () => {
    const { getByText } = render(
      <ScaledText style={{ fontSize: 20 }}>hello</ScaledText>,
      { wrapper: withMultiplier(1.15) },
    );
    const flattened = StyleSheet.flatten(getByText('hello').props.style);
    expect(flattened.fontSize).toBeCloseTo(23);
  });

  it('does not throw and applies no multiplier when rendered outside a provider', () => {
    const { getByText } = render(
      <ScaledText style={{ fontSize: 20 }}>hello</ScaledText>,
    );
    const flattened = StyleSheet.flatten(getByText('hello').props.style);
    expect(flattened.fontSize).toBe(20);
  });

  it('always enforces the safety cap regardless of an explicit prop', () => {
    const { getByText } = render(
      <ScaledText maxFontSizeMultiplier={5} style={{ fontSize: 20 }}>
        hello
      </ScaledText>,
    );
    expect(getByText('hello').props.maxFontSizeMultiplier).toBe(1.1);
  });

  it('respects an explicit allowFontScaling={false} override', () => {
    const { getByText } = render(
      <ScaledText allowFontScaling={false} style={{ fontSize: 20 }}>
        hello
      </ScaledText>,
    );
    expect(getByText('hello').props.allowFontScaling).toBe(false);
  });

  it('defaults allowFontScaling to true when not specified', () => {
    const { getByText } = render(
      <ScaledText style={{ fontSize: 20 }}>hello</ScaledText>,
    );
    expect(getByText('hello').props.allowFontScaling).toBe(true);
  });
});

describe('ScaledTextInput', () => {
  it('forwards a ref to the underlying native input (so .focus()/.blur()/.clear() keep working)', () => {
    const ref = React.createRef<any>();
    render(<ScaledTextInput ref={ref} testID="input" />);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current.focus).toBe('function');
  });

  it('multiplies fontSize according to the current FontScaleContext', () => {
    const { getByTestId } = render(
      <ScaledTextInput testID="input" style={{ fontSize: 16 }} />,
      { wrapper: withMultiplier(0.9) },
    );
    const flattened = StyleSheet.flatten(getByTestId('input').props.style);
    expect(flattened.fontSize).toBeCloseTo(14.4);
  });

  it('always enforces the safety cap regardless of an explicit prop', () => {
    const { getByTestId } = render(
      <ScaledTextInput testID="input" maxFontSizeMultiplier={5} />,
    );
    expect(getByTestId('input').props.maxFontSizeMultiplier).toBe(1.1);
  });
});

describe('patchGlobalTextScaling', () => {
  it('reassigns the react-native package Text/TextInput exports to the wrapped versions', () => {
    patchGlobalTextScaling();

    const reactNative = require('react-native');

    expect(reactNative.Text).toBe(ScaledText);
    expect(reactNative.TextInput).toBe(ScaledTextInput);
  });

  it('is idempotent — calling it again does not throw or double-wrap', () => {
    expect(() => {
      patchGlobalTextScaling();
      patchGlobalTextScaling();
    }).not.toThrow();

    const reactNative = require('react-native');
    expect(reactNative.Text).toBe(ScaledText);
  });
});
