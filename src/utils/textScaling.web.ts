/**
 * Web fallback for textScaling.tsx. The native module patches React Native's
 * internal Text/TextInput (react-native/Libraries/...), which react-native-web
 * does not ship, so importing them breaks the web bundle. Browsers have no OS
 * font-scale multiplier to cap, so the web build keeps react-native-web's own
 * Text/TextInput untouched. Web is only used by the read-only post card
 * preview (src/app/preview/post-card.tsx).
 */
export function patchGlobalTextScaling() {}
