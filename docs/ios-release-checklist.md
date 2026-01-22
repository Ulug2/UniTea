# iOS Release Checklist (TestFlight → App Store)

This is everything you need to ship a beta (TestFlight) and then a public release. Follow in order.

## Accounts, membership, and identifiers
- **Apple Developer Program (paid)**: Enroll ($99/year) with the Apple ID you’ll use in Xcode/App Store Connect.
- **D‑U‑N‑S number** (if enrolling as a company).
- **Banking + tax info** added in App Store Connect (Payments and Financial Reports).
- **Bundle Identifier**: `com.unitea.app` reserved in App Store Connect → Identifiers.
- **App ID capabilities**: enable Push Notifications and Associated Domains (requires paid account).

## Legal and policy
- **Privacy Policy URL** (publicly reachable HTTPS page).
- **Terms of Service URL** (recommended).
- **Data use disclosures**: fill in App Privacy details (App Store Connect) and ATT usage if you track users.
- **Third‑party SDK review**: list data they collect (e.g., Supabase, Expo services, analytics if any).

## Project readiness (codebase)
- **app.json/app.config**: correct `bundleIdentifier`, icons, splash, version `1.0.0`, buildNumber `1`.
- **Capabilities**: Push + Associated Domains only if needed; keep `expo-dev-client` out of release builds.
- **Env/config**: no `.env` secrets bundled; production API keys set; staging vs production Supabase configured.
- **Images/assets**: final app icon, splash, and marketing assets in `assets/`.
- **Versioning**: bump `version` and `ios.buildNumber` each release.

## Build + signing
- **Xcode/Expo**: run `npx expo prebuild --clean` if native config changed; open `ios/UniTee.xcworkspace`.
- **Signing**: Xcode → Targets `UniTee` → Signing & Capabilities → Team selected, automatic signing on.
- **Profiles/certs**: let Xcode create them (paid account required).
- **Release build locally** (optional smoke): `npx expo run:ios --configuration Release`.

## TestFlight distribution
- **Archive**: In Xcode select `Any iOS Device` → Product → Archive.
- **Upload**: Distribute to App Store Connect → iOS App Store / TestFlight.
- **App Store Connect setup**:
  - Create app record (name, subtitle, description, keywords, support URL, marketing URL).
  - Pricing: set `Free` (or your price).
  - App Privacy: complete questionnaire.
  - Add testers: internal (immediate) or external (needs Apple review with a short test note).
- **Test artifacts**: upload screenshots (6.7", 6.1", 5.5" recommended), app icon auto from build.
- **Notes for review** (external TF): explain login steps, demo account, feature flags.

## Pre‑App‑Store checks (after TF feedback)
- **Crash/bug sweep**: fix TestFlight issues, verify push and deep links.
- **Performance**: cold start, scrolling lists, image loading on cellular.
- **App Store metadata**: final description, promotional text, age rating, copyright, contact info.
- **Compliance**: export compliance (no proprietary encryption beyond HTTPS), privacy policy URL live.

## App Store submission
- **Bump build number** and re‑archive if changes.
- **Submit for review**: choose latest build, attach release notes, select territory availability.
- **Answer review questions**: sign‑in demo credentials, feature notes (push, location, ATT if any).

## Post‑approval
- **Release**: manual or phased release to production.
- **Monitoring**: App Analytics, crashes (Xcode Organizer), Supabase metrics, front‑end logging.
- **Hotfix flow**: bump build number, patch, archive, resubmit; keep TF testers for quick validation.

## Quick command reminders
- Start Metro (development): `npm start`
- Clean native project after config changes: `npx expo prebuild --clean`
- Local release build: `npx expo run:ios --configuration Release`
- Open workspace: `open ios/UniTee.xcworkspace`
