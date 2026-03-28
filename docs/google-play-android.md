# Google Play Android Release Guide (Expo + EAS)

This guide reflects the current `UniTee` repository and focuses on Android production readiness.

It separates:
- what is already implemented in code/config
- what still requires manual action in Play Console, EAS, and web hosting

---

## Implemented in codebase

- Android package id is set to `com.unitea.app` in `app.json`
- EAS production profile is configured with `autoIncrement: true` in `eas.json`
- Android app links intent filters are configured for `https://unitea.app`
- Android native manifest is aligned with app links for `/--`, `/post`, `/lostfoundpost`
- `runtimeVersion` is configured (`policy: "appVersion"`)
- `updates.fallbackToCacheTimeout` is set to `0`
- Sensitive permissions are blocked in Expo config:
  - `android.permission.RECORD_AUDIO`
  - `android.permission.SYSTEM_ALERT_WINDOW`
- Native Android manifest was cleaned to remove sensitive/legacy storage permissions
- `expo-notifications` plugin is configured for Android notification color
- Push registration/channel logic exists in `src/hooks/usePushNotifications.ts`
- Android release helper scripts were added to `package.json`:
  - `build:android:production`
  - `submit:android:production`
- Android native `versionName` is aligned to `1.1.0` in `android/app/build.gradle`

---

## Still required (manual / external)

- Verify final production asset dimensions/quality for Play listing and launcher rendering
- Create/complete Play Console app for package `com.unitea.app`
- Configure signing flow (`eas credentials` + Play App Signing)
- Host `https://unitea.app/.well-known/assetlinks.json`
- Add required EAS secrets for production
- Complete Play listing and policy forms (Data safety, content rating, etc.)
- Run internal testing and validate behavior on physical Android devices

---

## Critical blockers before first release

## 1) Android App Links verification

`autoVerify: true` is enabled, so host:
- `https://unitea.app/.well-known/assetlinks.json`

Use:
- package: `com.unitea.app`
- SHA-256: Play **app signing** certificate fingerprint (not only local debug/upload key)

Without this, Android links may not auto-open in the app reliably.

---

## Release runbook (manual steps)

Run in this order.

## 1) Prepare EAS

```bash
eas login
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --scope project
```

Optional:

```bash
eas secret:create --name EXPO_PUBLIC_APP_URL --value "https://unitea.app" --scope project
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "YOUR_SENTRY_DSN" --scope project
```

Then configure signing:

```bash
eas credentials
```

## 2) Build Android release

```bash
npm run build:android:production
```

or:

```bash
eas build --platform android --profile production
```

Expected artifact: `.aab`

## 3) Google Play Console setup

- Create app with package `com.unitea.app`
- Complete store listing:
  - app name/description
  - icon/screenshots
  - privacy policy URL
- Complete policy forms:
  - Data safety
  - content rating
  - target audience

## 4) Internal testing first

- Upload `.aab` to Internal testing track
- Add testers
- Validate core user flows on physical Android devices

## 5) Production rollout

- Start staged rollout
- Monitor crashes/ANRs and vital metrics
- Expand rollout after stability confirmation

---

## Data safety checklist for this app

Ensure Play disclosures match real behavior:

- Account/auth data (Supabase Auth)
- User-generated content (posts/comments/chat)
- User-provided media uploads (images)
- Notification token/settings behavior
- Any moderation/external processing flows

Keep Data safety answers, privacy policy, and runtime behavior consistent.

---

## Android QA checklist

- Login/logout/session restore work correctly
- Feed browsing and post details work
- Create post + image upload works
- Chat send/receive works
- Deep links route correctly:
  - `/post/:id`
  - `/lostfoundpost/:id` (legacy/direct support)
- Notification permission flow works as expected
- Push token registration and notification tap routing work
- No crash loops on cold start/background resume

---

## Relevant files

- `app.json`
- `eas.json`
- `package.json`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/build.gradle`
- `src/hooks/usePushNotifications.ts`
- `src/app/(protected)/_layout.tsx`
- `src/utils/sharePost.ts`
- `src/lib/supabase.ts`

