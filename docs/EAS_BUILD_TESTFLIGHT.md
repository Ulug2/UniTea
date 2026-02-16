# EAS Build & Submit to TestFlight

Step-by-step to build your app with EAS and install updates via TestFlight.

---

## Prerequisites

1. **EAS CLI** (if not installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Expo account** – Log in (same account that owns the project in app.json `owner`):
   ```bash
   eas login
   ```

3. **Apple Developer Program** – Enrolled ($99/year). Your app’s Bundle ID `com.unitea.app` must be registered in [Apple Developer](https://developer.apple.com/account).

4. **App in App Store Connect** – Create the app in [App Store Connect](https://appstoreconnect.apple.com) with Bundle ID `com.unitea.app` if you haven’t already. You need this for TestFlight.

---

## 1. EAS Secrets (production env for the build)

Builds use **EAS Secrets** so real keys are not in the repo. Set these once (from project root):

```bash
# Required for Supabase
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --scope project

# Optional: Sentry (if you use it in production)
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "YOUR_SENTRY_DSN" --scope project

# Optional: Share link base URL (if you use EXPO_PUBLIC_APP_URL for share post links)
eas secret:create --name EXPO_PUBLIC_APP_URL --value "https://unitea.app" --scope project
```

- Get **Supabase URL** and **anon key** from [Supabase Dashboard](https://supabase.com/dashboard) → your project → Settings → API.
- List secrets: `eas secret:list`.

---

## 2. Build for iOS (production)

From the **project root** (UniTee, not `moderation`):

```bash
eas build --platform ios --profile production
```

- EAS will build in the cloud. First time you may be asked to create/select **Apple credentials** (distribution certificate + provisioning profile). Choose “Let EAS handle it” if you want EAS to manage them.
- When the build finishes, you get a link to the build page and an **.ipa** you can download.

Your `eas.json` has `"autoIncrement": true` for production, so the iOS build number is bumped automatically for each build.

---

## 3. Submit the build to TestFlight

After a build completes, submit the **latest** build to App Store Connect (TestFlight):

```bash
eas submit --platform ios --profile production --latest
```

- **`--latest`** uses the most recent successful iOS production build.
- First time: EAS may ask for your **Apple ID** and an **App-Specific Password** (create one at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords).
- EAS uploads the .ipa to App Store Connect. Within a few minutes the build appears under **TestFlight** for your app.

To submit a **specific** build instead of `--latest`:

```bash
eas submit --platform ios --profile production --id BUILD_ID
```

Get `BUILD_ID` from the build list: `eas build:list --platform ios --limit 5`.

---

## 4. Install from TestFlight

1. In [App Store Connect](https://appstoreconnect.apple.com) → your app → **TestFlight**.
2. Add **Internal** or **External** testers (or use your own Apple ID).
3. On your iPhone: install **TestFlight** from the App Store, then open the invite link or the TestFlight app and install **Unitee**.

You can repeat **Build → Submit → Install** whenever you want to push an update to testers.

---

## 5. Optional: Non-interactive submit (CI / scripts)

To avoid prompts when running submit, add your App Store Connect App ID to `eas.json` and use stored credentials:

1. In App Store Connect → your app → **App Information** → copy **Apple ID** (numeric, e.g. `1234567890`).
2. In `eas.json`, under `submit.production`:
   ```json
   "submit": {
     "production": {
       "ios": {
         "ascAppId": "YOUR_APPLE_APP_ID"
       }
     }
   }
   ```
3. Store credentials with EAS once:  
   `eas credentials` → select iOS → production → configure as needed.  
   Then `eas submit --platform ios --profile production --latest` can run without interactive Apple login.

---

## Quick reference

| Step              | Command |
|-------------------|--------|
| Login             | `eas login` |
| Set secrets       | `eas secret:create --name NAME --value "VALUE" --scope project` |
| Build iOS         | `eas build --platform ios --profile production` |
| Submit to TestFlight | `eas submit --platform ios --profile production --latest` |
| List builds       | `eas build:list --platform ios` |

---

## Troubleshooting

- **Build fails (native module / signing)**  
  Run `npx expo prebuild --clean` locally and fix any errors; then trigger the EAS build again.

- **Submit asks for Apple ID every time**  
  Use `eas credentials` to configure and store Apple credentials for the project, or add `ascAppId` and use an app-specific password.

- **Build not showing in TestFlight**  
  Wait 5–10 minutes after submit. In App Store Connect → TestFlight, check the build status; if it’s “Missing Compliance”, answer the export compliance question (e.g. no encryption beyond HTTPS).

- **Wrong env in app**  
  Double-check `eas secret:list` and that secret names match what the app reads (`EXPO_PUBLIC_SUPABASE_URL`, etc.). Rebuild after changing secrets.
