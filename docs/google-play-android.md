# Google Play (Android) Release Guide (Expo + EAS)

This guide is tailored to your Expo app in `/Users/ulykbekkhairulla/dev/UniTee`, which uses Expo Router and EAS Build.

Key repo files used here:
- Expo config: [`app.json`](app.json)
- EAS build profiles: [`eas.json`](eas.json)
- Deep link handling: [`src/app/(protected)/_layout.tsx`](src/app/(protected)/_layout.tsx)
- Push notification token logic: [`src/hooks/usePushNotifications.ts`](src/hooks/usePushNotifications.ts)
- Chat helper that suppresses in-app banners: [`src/app/(protected)/chat/[id].tsx`](src/app/(protected)/chat/[id].tsx)

## 1) Prerequisites

### Tools to install
1. Node.js (v18+ recommended)
2. Android Studio + an Android emulator
3. Expo CLI (via `npx` is fine)
4. EAS CLI:
```bash
npm install -g eas-cli
```

### Create an Android emulator
In Android Studio:
1. Open **Device Manager**
2. Create a new emulator (example: Pixel 6, API 34)
3. Start the emulator

Verify the emulator is visible:
```bash
adb devices
```
You should see an `emulator-xxxx` device.

## 2) Code/config checklist before you build for Google Play

Treat this as a preflight checklist to avoid common Google Play rejection issues.

### 2.1 App identity (package name) matches Google Play Console
Your Android package name comes from [`app.json`](app.json) under `expo.android.package`.

- Current value: `com.unitea.app`

What to check:
1. Create the app in Google Play Console using package name `com.unitea.app`
2. Ensure your built AAB uses the same package name (EAS builds from `app.json`)

Relevant file:
- [`app.json`](app.json)

### 2.2 Versioning / build numbers
Your `eas.json` sets:
- production profile: `autoIncrement: true`

What to check:
1. Every new Android production build uploaded to Play must have an increased `versionCode`
2. If EAS is used, this is usually handled automatically by the `autoIncrement` setting

Relevant file:
- [`eas.json`](eas.json)

### 2.3 Permissions audit (especially mic / audio)
Your `app.json` requests:
- `android.permission.RECORD_AUDIO`

What to check:
1. Confirm the app truly needs microphone access on Android
2. If you do not implement microphone features, remove the permission from `app.json` (Google Play will scrutinize “unused” sensitive permissions)
3. If you keep it, make sure your **Data safety** and **Privacy Policy** disclosures match what the app does

Relevant file:
- [`app.json`](app.json)

### 2.4 Photo / camera permissions (expo-image-picker)
Your Expo config includes `expo-image-picker` with permission strings.

What to check:
1. The app uses image picking (it does: `expo-image-picker` via your image pipeline)
2. Your Data safety form correctly reflects “Photos and videos” (user-provided content uploaded)

Relevant config:
- [`app.json`](app.json)

Relevant code (image picking):
- [`src/hooks/useImagePipeline.ts`](src/hooks/useImagePipeline.ts)
- [`src/app/(protected)/create-post.tsx`](src/app/(protected)/create-post.tsx)

### 2.5 Deep links / Android app links (autoVerify)
Your Android intent filter uses `autoVerify: true` in [`app.json`](app.json), with:
- scheme: `https`
- host: `unitea.app`
- pathPrefix: `/--`
- pathPrefix: `/post`
- pathPrefix: `/lostfoundpost`

Your in-app deep link router logic handles:
- `post/<id>` (navigates to `/post/[id]`)
- `lostfoundpost/<id>` (navigates to `/lostfoundpost/[id]`)

What to check (important):
1. Because `autoVerify: true` is enabled, Google Play will attempt to verify your domain.
   - You must host a correct Android `assetlinks.json` at:
     - `https://unitea.app/.well-known/assetlinks.json`
2. Ensure the verified paths match what the app expects (`post/*` and `lostfoundpost/*`).

Relevant files:
- [`app.json`](app.json)
- [`src/app/(protected)/_layout.tsx`](src/app/(protected)/_layout.tsx)
- Share/deep link URLs (base URL): [`src/utils/sharePost.ts`](src/utils/sharePost.ts)

### 2.6 Push notifications: request permission + token saving
Push notification handling exists in:
- [`src/hooks/usePushNotifications.ts`](src/hooks/usePushNotifications.ts)

In that file:
1. A notification handler is set via `Notifications.setNotificationHandler(...)`
2. `registerForPushNotificationsAsync()`:
   - requests notification permissions
   - gets an Expo push token
   - upserts the token to Supabase table `notification_settings` (only on real physical devices)

What to check (very important):
1. Google Play will not reject missing push notifications by itself, but your app must still meet policy expectations around permissions and functionality.
2. In this codebase, `usePushNotifications()` (the hook that requests permissions + stores the token) appears to NOT be called anywhere.
   - `chat/[id].tsx` imports and uses `setCurrentViewedChatPartnerId`, but not `usePushNotifications()`.
3. If you want push notifications to work for users, ensure `usePushNotifications()` is invoked in a component that mounts when the user is logged in (commonly in your root/protected layout).

Simulator note:
- `usePushNotifications()` will warn and return early on non-physical devices:
  - `if (!Device.isDevice) { ... return null; }`
So test push notifications on a real Android phone.

Relevant files:
- [`src/hooks/usePushNotifications.ts`](src/hooks/usePushNotifications.ts)
- [`src/app/(protected)/chat/[id].tsx`](src/app/(protected)/chat/[id].tsx)

### 2.7 Environment variables required at runtime
Your Supabase client throws at startup if missing:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Relevant file:
- [`src/lib/supabase.ts`](src/lib/supabase.ts)

So before production builds, ensure these are set as **EAS secrets**.

## 3) Run the app on Android (simulator)

You have two practical ways to run:

### Option A: `expo start` + Emulator (Expo Go)
1. Start the Expo dev server:
```bash
npm start
```
2. Press `a` when prompted to open Android.
3. If you’re using Expo Go, the app should open on the emulator.

### Option B (often best with EAS dev clients): `npm run android`
Your `package.json` defines:
- `android`: `expo run:android`

Run:
```bash
npm run android
```

Notes:
1. This generates/builds native Android code and installs the app on the running emulator.
2. If this is your first time, it may take longer because native build steps run.

### Reload after code changes
Usually:
1. Keep the Metro bundler running
2. Use Expo’s hot reload / fast refresh
If you see stale UI:
```bash
npx expo start -c
```

### Push notifications test reminder
For push notifications (token saving / receiving):
- Use a physical device for Android tests (emulator may not be able to get the Expo push token).

## 4) Build an Android release AAB for Google Play (EAS)

### 4.1 Login to EAS
From the repo root:
```bash
eas login
```

### 4.2 Create required EAS secrets (production)
EAS secrets are used instead of committing real keys to the repo.

At minimum (required by [`src/lib/supabase.ts`](src/lib/supabase.ts)):
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --scope project
```

Optional (if your production needs it):
```bash
eas secret:create --name EXPO_PUBLIC_APP_URL --value "https://unitea.app" --scope project
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "YOUR_SENTRY_DSN" --scope project
```

Sanity check:
```bash
eas secret:list
```

### 4.3 Configure Android credentials (upload key)
Before the first Play build, EAS must have signing credentials configured for Android production.

What to do:
1. Run:
```bash
eas credentials
```
2. Configure Android -> production signing (keystore / upload key details)
3. If you use Play App Signing, remember:
   - You upload with your **upload key**
   - Play signs the final APK/AAB with its managed **app signing key**

### 4.4 Build the release artifact
From the repo root:
```bash
eas build --platform android --profile production
```

What you want for Google Play:
- An `.aab` (Android App Bundle)

## 5) Put the app on Google Play (Play Console steps)

### 5.1 Create the app in Play Console
1. Go to Google Play Console
2. Create **app** with:
   - package name: `com.unitea.app`
3. Choose default language(s), then continue.

### 5.2 Configure app signing / upload keys
Follow Play Console prompts for signing:
1. Upload key / app signing key configuration
2. Ensure it matches the key flow you configured in EAS credentials

### 5.3 Store listing requirements (minimum)
Fill:
1. App title, short description, full description
2. App icon (Play uses different sizes; upload adaptive if available)
3. Screenshots (at least for required device form factors)
4. Privacy Policy URL
5. Content rating / target audience

### 5.4 Data safety form (usually the biggest review item)
Your app includes:
1. User-generated content:
   - posts, lost & found items, comments, replies, and chat messages
2. Media uploads:
   - images selected by user and uploaded (via Supabase storage)
3. Accounts and authentication:
   - Supabase Auth (email/password)
4. Third-party processing:
   - OpenAI moderation / checks (Edge Functions)
5. Push notifications:
   - via Expo push notification flow

What to do:
1. Carefully answer each Data safety question based on what’s actually used
2. If you keep `RECORD_AUDIO`, you must describe microphone usage and data handling

### 5.5 Upload the release (Internal Testing first)
1. Create a new release
2. Choose a track:
   - Internal testing is recommended first
3. Upload your `.aab` built by EAS
4. Name the release and configure rollout
5. Submit and wait for processing

## 6) Verify Android App Links (autoVerify) with `assetlinks.json`

Because `autoVerify: true` is enabled in [`app.json`](app.json), you must host a correct Digital Asset Links file.

Checklist:
1. Get the SHA-256 certificate fingerprint(s) that Google needs:
   - For debug builds, it differs from release builds
   - For Play App Signing, you need the app signing certificate fingerprint (final one)
2. Create this file:
   - `https://unitea.app/.well-known/assetlinks.json`
3. Ensure it includes your:
   - package name: `com.unitea.app`
   - certificate digest (SHA-256, hex)
4. Ensure the relation targets the correct paths you want to support (`/post/*` and if added `/lostfoundpost/*`).

If verification fails, Play may not route links to your app automatically.

## 7) Troubleshooting (common Play blockers)

### 7.1 “App not found” / wrong package name
Fix:
1. Ensure Play Console app uses package `com.unitea.app`
2. Ensure `app.json` `expo.android.package` matches
3. Rebuild the AAB and re-upload

Relevant:
- [`app.json`](app.json)

### 7.2 Signing errors / keystore mismatch
Fix:
1. Confirm EAS Android production credentials are configured correctly
2. If Play App Signing is enabled, confirm you are using the correct fingerprint in `assetlinks.json`

### 7.3 Deep link verification fails
Fix:
1. Confirm `assetlinks.json` exists and is reachable over HTTPS
2. Confirm package name and SHA-256 digest are correct
3. Confirm intent filter `pathPrefix` values match your assetlinks paths

Relevant:
- [`app.json`](app.json)
- [`src/app/(protected)/_layout.tsx`](src/app/(protected)/_layout.tsx)

### 7.4 Build fails locally vs in EAS
Fix:
1. Try a clean prebuild:
```bash
npx expo prebuild --clean
```
2. Re-run EAS build

## 8) Suggested “before you press submit” manual QA

Before uploading the AAB:
1. Login flow works on Android
2. Feed browsing and creating posts works
3. Image upload flow works
4. Deep links open the expected screens:
   - `/post/<id>`
   - if you add it: `/lostfoundpost/<id>`
5. Chat works and notifications behavior is acceptable for your test setup

