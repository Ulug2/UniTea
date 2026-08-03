import React, { forwardRef, useContext } from "react";
import { StyleSheet } from "react-native";
import type { TextProps, TextInputProps } from "react-native";
import { FontScaleContext } from "../context/FontScaleContext";

/**
 * OS accessibility font-scale ceiling. React Native no longer applies
 * Text.defaultProps under the automatic JSX runtime — verified React 19's
 * react/jsx-runtime never reads type.defaultProps (only the legacy
 * React.createElement path does, which this app's JSX never goes through),
 * so the previous `(Text as any).defaultProps.maxFontSizeMultiplier` in
 * _layout.tsx never actually reached rendered elements. This module patches
 * RN's own Text/TextInput export in place instead (see
 * patchGlobalTextScaling below), so every existing `import { Text } from
 * "react-native"` across the app picks up the cap with zero per-file changes.
 */
const SAFE_MAX_FONT_SIZE_MULTIPLIER = 1.1;

function applyMultiplierToStyle(
  style: TextProps["style"],
  multiplier: number,
) {
  if (multiplier === 1) return style;
  const flattened = StyleSheet.flatten(style);
  if (!flattened || typeof flattened.fontSize !== "number") return style;
  return [style, { fontSize: flattened.fontSize * multiplier }];
}

// Real components, required directly from their RN internal paths (not the
// `react-native` barrel) — this is exactly what patchGlobalTextScaling below
// reassigns, so grabbing a reference here first is what lets the wrapper
// still render the genuine native Text/TextInput underneath.
const RealText = require("react-native/Libraries/Text/Text").default;
const RealTextInput =
  require("react-native/Libraries/Components/TextInput/TextInput").default;

// useContext (not the throwing useFontScale()) so Text/TextInput keep
// working with no multiplier applied when rendered outside a
// FontScaleProvider — e.g. before the provider mounts, or in tests that
// render individual components in isolation.
function useMultiplier(): number {
  const fontScale = useContext(FontScaleContext);
  return fontScale?.multiplier ?? 1;
}

const ScaledText = forwardRef<any, TextProps>(function ScaledText(
  props,
  ref,
) {
  const multiplier = useMultiplier();
  return (
    <RealText
      allowFontScaling
      {...props}
      ref={ref}
      // Always enforced, never overridable by a caller — this is the actual
      // safety guarantee ("system font scaling cannot completely break
      // layouts"), so it can't be silently widened by a future prop.
      maxFontSizeMultiplier={SAFE_MAX_FONT_SIZE_MULTIPLIER}
      style={applyMultiplierToStyle(props.style, multiplier)}
    />
  );
});
ScaledText.displayName = "Text";

const ScaledTextInput = forwardRef<any, TextInputProps>(
  function ScaledTextInput(props, ref) {
    const multiplier = useMultiplier();
    return (
      <RealTextInput
        allowFontScaling
        {...props}
        ref={ref}
        maxFontSizeMultiplier={SAFE_MAX_FONT_SIZE_MULTIPLIER}
        style={applyMultiplierToStyle(props.style, multiplier)}
      />
    );
  },
);
ScaledTextInput.displayName = "TextInput";

let isPatched = false;

/**
 * Reassigns the `react-native` package's own Text/TextInput exports to the
 * wrapped versions above. Must run once, synchronously, before any component
 * renders — see the top of src/app/_layout.tsx.
 *
 * This patches react-native/index.js's `Text`/`TextInput`, NOT the leaf
 * Libraries/Text/Text.js `export default`. Metro compiles a source-level
 * `export default` into a non-configurable accessor
 * (`Object.defineProperty(exports, "default", { get() {...} })` with no
 * `configurable: true`), so redefining it throws "property is not
 * configurable" at runtime — this only appeared to work under Jest because
 * babel-jest compiles `export default` to a plain, configurable assignment
 * instead. react-native/index.js's `Text`/`TextInput`, by contrast, are
 * plain object-literal getters (`get Text() { return require(...).default }`)
 * written directly in CJS source, which per spec ARE configurable. Every
 * `import { Text } from "react-native"` call site reads through this same
 * barrel object at render time, so patching it here gives identical
 * app-wide coverage with no per-file changes.
 */
export function patchGlobalTextScaling() {
  if (isPatched) return;
  isPatched = true;

  const reactNative = require("react-native");
  Object.defineProperty(reactNative, "Text", {
    value: ScaledText,
    configurable: true,
    writable: true,
    enumerable: true,
  });
  Object.defineProperty(reactNative, "TextInput", {
    value: ScaledTextInput,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

// Exported for tests only.
export const __internal = { ScaledText, ScaledTextInput, applyMultiplierToStyle };
