# Android smoke-test checklist & UX punch list

This complements the [Google Play release guide](google-play-android.md) and the Android production audit plan. Use it for **manual QA on Android** before shipping or after risky changes.

**Devices:** Prefer at least two configurations: gesture navigation + 3-button nav; one ~360dp width, one ~412dp.

---

## Screen-by-screen smoke test

Check each row on **Android** (physical device or emulator). Note pass/fail and build number.

### Auth

| Screen | Route / entry | What to verify |
|--------|-----------------|------------------|
| Login / signup | `(auth)/index` | Keyboard opens without double-jump; fields scroll if needed; theme toggle if present; links open |
| OAuth callback | `(auth)/callback` | Completes without error when returning from provider |

### Tabs (bottom nav)

| Screen | Tab | What to verify |
|--------|-----|----------------|
| Feed | `(tabs)/index` | Filters (hot/new/top); scroll; pull-to-refresh if any; **no stray bottom gap** vs tab bar |
| Chat list | `(tabs)/chat` | List scroll; unread badge; open thread |
| Lost & Found | `(tabs)/lostfound` | Search/filters; **keyboard**: tab bar hides or stays under keyboard (`tabBarHideOnKeyboard`); no floating UI |
| Profile | `(tabs)/profile` | Scroll; settings affordance |

### Stack / modals (from tabs)

| Flow | What to verify |
|------|----------------|
| Create post | `create-post` (feed) | Slide animation on Android; keyboard + footer; submit |
| Create L&F | `create-post?type=...` | Same + L&F-specific fields |
| Post detail + comments | `post/[id]` | Custom header on Android; **comments composer** sits above keyboard; back (hardware + UI) |
| Chat thread | `chat/[id]` | Inverted list; composer; **keyboard**; long-press / Android alert vs iOS sheet |
| L&F detail | `lostfoundpost/[id]` | Back gesture; horizontal gallery vs nav gesture; share |

### Settings & profile modals

| Modal | What to verify |
|-------|----------------|
| Settings sheet | `ProfileSettingsModal` | **No black strip** under sheet on Android; dismiss |
| Notifications | `NotificationSettingsModal` | Same; toggles |
| Manage account | `ManageAccountModal` | Keyboard on username/password; translucent nav ok |
| Report / block | `ReportModal`, `BlockUserModal` | Keyboard; dismiss |

### Other

| Area | What to verify |
|------|----------------|
| Deep link | Open `https://unitea.app/post/<id>` (and L&F if configured) | Resolves in-app after `assetlinks.json` is live |
| Push | Background + foreground | Channel, sound, tap → correct screen |
| Share | From post / L&F | Intent resolves |

---

## Global checks (every run)

- [ ] Cold start → no crash; splash → main UI
- [ ] Light + dark theme: status bar readable; no white/black flash at bottom
- [ ] Rotate if you support landscape (if portrait-only, confirm locked)
- [ ] Low memory: background app, return → state acceptable

---

## Remaining UX punch list (by severity)

Use this as a **backlog**, not necessarily blockers. Items marked **done in code** are implemented; still **verify on device**.

### P0 — Ship blockers / policy

| Item | Notes |
|------|--------|
| **`assetlinks.json` live** | Required for verified App Links; verify SHA-256s (upload + Play signing). |
| **Play Console + AAB** | First release path: internal testing → production. |
| **Data safety / permissions** | Align disclosures with `RECORD_AUDIO`, photos, push, UGC. |

### P1 — High UX / reliability on Android

| Item | Notes |
|------|--------|
| **Edge-to-edge + tab bar** | Confirm no “floating” strip on **gesture-nav** devices; modals use `navigationBarTranslucent` where needed. |
| **Keyboard vs `resize`** | Post comments, create-post, chat: no double offset; footer aligned above keyboard. |
| **Push on real device** | Token + channel; notification tap routing. |

### P2 — Medium polish

| Item | Notes |
|------|--------|
| **Fonts** | `Poppins_600SemiBold` loaded in root `_layout` — spot-check semibold text vs system fallback. |
| **Shadows** | `CommentComposer` and any view with `shadow*` but no `elevation` / `shadowColor` — minor flat appearance on Android. |
| **`lostfoundpost/[id]`** | Back gesture vs horizontal gallery — no accidental navigation. |
| **Tab stack after modal** | Return from create-post / post detail — no flicker or wrong tab. |

### P3 — Low / nice-to-have

| Item | Notes |
|------|--------|
| **Haptics** | Not used; optional parity with iOS later. |
| **Keyboard theme** | Android IME follows system/keyboard app; app `keyboardAppearance` is iOS-only where set. |
| **Sentry / Android** | Confirm Android errors appear in dashboard after release. |

---

## Mapping to audit plan categories

| Audit category | Smoke-test coverage |
|----------------|----------------------|
| UI / SafeArea / fonts | Tabs, modals, post/chat screens |
| Keyboard | create-post, post comments, chat, auth, modals |
| Navigation / animations | create-post slide, post stack, L&F detail |
| Platform code | Spot-check `Platform.OS === 'android'` paths |
| Permissions | Image picker, notifications, mic if still declared |
| Performance | Feed/chat lists: scroll, no runaway jank |
| Network / loading | Offline/slow: error states, retries |
| Fragmentation | Two devices + nav modes |

---

## Sign-off

| Tester | Device(s) | Build | Date | Pass |
|--------|-------------|-------|------|------|
| | | | | |
