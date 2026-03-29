# Android keyboard vs tab bar: Expo Go vs development / release build

This note explains **why keyboard behavior can differ between Expo Go and a real Android binary** (local `expo run:android`, EAS dev client, or production AAB), and where to look in this repo. It is intended for whoever maintains keyboard / tab-bar UX.

---

## Summary (root cause)

Behavior diverges because **Expo Go and your app are different native applications**.

1. **Different `Activity` / manifest**  
   In Expo Go, your JS runs inside **Expo Go’s** `MainActivity` and manifest. In a dev client or store build, your JS runs inside **`com.unitea.app`’s** `MainActivity` with **your** `AndroidManifest.xml` flags.  
   Keyboard + window insets are therefore **not guaranteed to match** Expo Go, even with the same JS.

2. **Your release-style app explicitly opts into modes that change IME behavior**  
   From `app.json`:
   - `android.softwareKeyboardLayoutMode`: `"resize"` → maps to **`adjustResize`** on the main activity (window resizes when the IME opens).
   - `android.edgeToEdgeEnabled`: **`true`** → edge-to-edge drawing; on recent Android / SDK levels this interacts with **WindowInsets**, navigation bar, and keyboard in ways that differ from Expo Go’s shell.

   Verified in the prebuilt project: `android/app/src/main/AndroidManifest.xml` sets  
   `android:windowSoftInputMode="adjustResize"` on `MainActivity`.

3. **Tab bar layout depends on safe-area bottom inset**  
   The tab navigator adds **dynamic height / padding from `useSafeAreaInsets().bottom`** on Android. When the keyboard opens, **`adjustResize` + edge-to-edge** can change how much vertical space is available and how **bottom insets** are reported compared to Expo Go. That can look like the footer/tab bar is covered, clipped, or jumping.

4. **Intentional hide on one tab**  
   `tabBarHideOnKeyboard: true` is set **only** on the **Lost & Found** tab. On that screen, hiding the tab bar when the keyboard is open is **by design** (see `src/app/(protected)/(tabs)/_layout.tsx`). Do not confuse that with a global regression unless the bug is limited to that tab.

---

## Evidence in this repo

| Item | Location |
|------|----------|
| `softwareKeyboardLayoutMode: "resize"` | `app.json` → `expo.android.softwareKeyboardLayoutMode` |
| `edgeToEdgeEnabled: true` | `app.json` → `expo.android.edgeToEdgeEnabled` |
| `adjustResize` on main activity | `android/app/src/main/AndroidManifest.xml` → `MainActivity` `android:windowSoftInputMode` |
| Tab bar uses `insets.bottom` on Android | `src/app/(protected)/(tabs)/_layout.tsx` → `tabBarStyle` `height` / `paddingBottom` |
| `tabBarHideOnKeyboard: true` (Lost & Found only) | Same file, `Tabs.Screen` `name="lostfound"` |

---

## Why “it worked in Expo Go” is not contradictory

Expo Go:

- Uses its **own** native keyboard and window configuration.
- Does **not** apply your app’s full `app.json` Android block to its host activity the same way a standalone build does.

Your dev / release build:

- Uses **your** manifest (`adjustResize`, theme, edge-to-edge flags from the Expo / React Native stack).
- Is the **authoritative** environment for Play Store and for “native” keyboard behavior.

So fixes validated **only** in Expo Go should be **re-tested** on a **development build** or **release build** before treating Android keyboard + bottom UI as done.

---

## Suggested direction for the fix (for the implementing agent)

Do **not** change behavior blindly; **isolate** which layer causes the mismatch:

1. **Confirm scope**  
   - All tabs vs only Lost & Found (remember `tabBarHideOnKeyboard` there).  
   - Specific screens (e.g. feed search vs chat composer).

2. **Compare modes (temporary experiments on a dev build)**  
   - Try `softwareKeyboardLayoutMode: "pan"` vs `"resize"` in `app.json` and run `npx expo prebuild` if you regenerate native (`pan` → `adjustPan`, less resize of the root view; can change whether the tab bar is overlapped vs shifted).  
   - If edge-to-edge is implicated, temporarily test with `edgeToEdgeEnabled: false` **only in a branch** to see if footer behavior aligns with expectations (then restore and fix properly with insets / keyboard APIs).

3. **JS-side hardening (common production approach)**  
   - Listen to `Keyboard` show/hide (or use `react-native-keyboard-controller` if you add it) and **adjust tab bar visibility or bottom offset** explicitly when the keyboard is visible, instead of relying only on default `adjustResize` + safe area.  
   - Audit **bottom padding** on screens with `KeyboardAvoidingView` / `ScrollView` `automaticallyAdjustKeyboardInsets` (several screens are iOS-biased in comments; Android may need explicit handling).

4. **Keep native folder in sync**  
   After changing `app.json` Android keyboard / edge-to-edge settings, ensure the **`android/`** project is regenerated or merged so `AndroidManifest.xml` reflects the new values (stale native projects are a frequent source of “config says X, binary does Y”).

---

## References

- Expo: `android.softwareKeyboardLayoutMode` → `adjustResize` / `adjustPan`  
- This app: `app.json`, `android/app/src/main/AndroidManifest.xml`, `src/app/(protected)/(tabs)/_layout.tsx`

---

## One-line takeaway

**Expo Go is not a faithful model of your app’s Android keyboard + edge-to-edge + `adjustResize` stack; the development/release binary is.** Differences in footer/tab bar behavior are expected until the UI is tuned against **that** stack, using the config and files above as the source of truth.
