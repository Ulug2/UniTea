# App Store Publish Checklist – UniTee

Everything left to do before and for publishing on the App Store (and staying secure).

---

## 1. Security (do first)

- [x] **Add `.env` to `.gitignore`**  
  `.env` is now in `.gitignore`. Use `.env` only locally; never commit it.

- [x] **`.env` was committed – rotate secrets**  
  The file was committed in the past (e.g. commit `28bb4a24`). **You should:**  
  1. In Supabase Dashboard → Project Settings → API: create a new anon key (or rotate if supported) and update your local `.env` and EAS Secrets.  
  2. In Sentry: create a new DSN or revoke the old one if possible; update local `.env` and EAS Secrets.  
  3. Optionally remove `.env` from git history (e.g. `git filter-repo` or BFG) so old keys are not in the repo history.

- [x] **Production config (EAS Secrets)**  
  Use EAS Secrets for production builds so real values aren’t in the repo. See **EAS Secrets setup** below.

- [x] **Row Level Security (RLS)**  
  In Supabase Dashboard → SQL Editor / Database → Tables, confirm RLS is **enabled** on all public tables: `profiles`, `posts`, `comments`, `chats`, `chat_messages`, `votes`, `bookmarks`, `blocks`, `notifications`, `reports`, `notification_settings`. Policies should restrict read/write by `auth.uid()` (and chat participants for chats/messages). Fix any table that allows unrestricted access.

- [x] **Storage RLS**  
  Ensure storage buckets (e.g. `post-images`, avatars) have RLS so only allowed users can read/write. Your code references `sql/storage_rls_policies.sql` – run or replicate that in Supabase if not already done.

- [x] **CORS**  
  Edge Functions now allow only `https://unitea.app` and `https://www.unitea.app` for browser requests. Requests with no `Origin` (e.g. from the native app) still get `*` so the app keeps working. Deploy the updated functions: `supabase functions deploy`.

---

### EAS Secrets setup

For production builds, set these secrets so the app gets config at build time (no `.env` in the repo):

```bash
# From project root, after: npx eas login
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --scope project
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "YOUR_SENTRY_DSN" --scope project
```

- Get **Supabase URL** and **anon key** from Supabase Dashboard → Project Settings → API.  
- Get **Sentry DSN** from Sentry → Project Settings → Client Keys (DSN).  
- Use the same values as in your local `.env` (or the new ones after rotating).  
- List secrets: `eas secret:list`.  
- Then run: `npx eas build --platform ios --profile production` (and similarly for Android). The build will use these secrets; your app code already reads `process.env.EXPO_PUBLIC_*`.

---

## 2. Supabase and OpenAI

- [x] **Supabase**  
  Confirm Free tier limits (500MB DB, 1GB storage, 2GB egress) are enough for launch. Plan to upgrade to Pro when you need backups, more resources, or >50K MAU.

- [x] **OpenAI**  
  Billing enabled; set **usage limits** and **budget alerts** in the OpenAI dashboard so moderation usage doesn’t overrun costs.

- [x] **Secrets in Supabase**  
  In Supabase Dashboard → Project Settings → Edge Functions, confirm `OPENAI_API_KEY` (and any other secrets) are set as secrets, not in code.

---

## 3. Apple and App Store Connect

- [x] **Apple Developer Program**  
  Enrolled ($99/year); same Apple ID used for Xcode and App Store Connect.

- [x] **Identifiers and capabilities**  
  Bundle ID `com.unitea.app` registered; Push Notifications and Associated Domains enabled if the app uses them.

- [ ] **Banking and tax**  
  Filled in App Store Connect (Payments and Financial Reports) if you ever plan paid apps or IAP.

- [ ] **App record in App Store Connect**  
  Name, subtitle, description, keywords, support URL, marketing URL, pricing (e.g. Free), age rating, copyright, contact.

- [ ] **App Privacy**  
  Questionnaire completed; list third-party SDKs and what data they collect (e.g. Supabase, Expo, Sentry).

- [x] **Legal**  
  Privacy Policy and Terms of Service URLs live and linked in the app and in App Store Connect. Your app already links to a Notion privacy policy – ensure the URL is public and stable.

- [ ] **Export compliance**  
  Declare no proprietary encryption (or fill the form if you do). Your `app.json` has `ITSAppUsesNonExemptEncryption: false` – keep that if you only use standard HTTPS.

---

## 4. App and build config

- [x] **app.json / app.config**  
  Correct `bundleIdentifier` (`com.unitea.app`), `version` (e.g. `1.0.0`), `ios.buildNumber` (e.g. `1`). Icons and splash in `assets/`.

- [ ] **No dev-only code in release**  
  No `.env` file bundled; production Supabase (and Sentry) config from EAS Secrets or safe config. Remove or guard any debug logs and dev-only feature flags.

- [ ] **EAS build**  
  Run:  
  `npx eas build --platform ios --profile production`  
  Fix any build errors; download or use the build for submission.

- [ ] **TestFlight**  
  Upload build to App Store Connect; add internal/external testers; test sign-in, push, deep links, and main flows. Fix crashes and major bugs.

---

## 5. Submission and review

- [ ] **Bump build number**  
  If you made changes after the last build, bump `ios.buildNumber` and create a new EAS build.

- [ ] **Submit for review**  
  In App Store Connect, select the build, add release notes, choose territories, submit.

- [ ] **Review notes**  
  Provide sign-in credentials (e.g. test account) and short notes for push, deep links, or any feature that needs explanation.

- [ ] **Post-approval**  
  Release manually or phased; monitor crashes (Sentry, Xcode Organizer) and Supabase usage.

---

## 6. Optional but recommended

- [ ] **Staging vs production**  
  Separate Supabase project (or env) for production so TestFlight and App Store use production API, and dev uses staging.

- [ ] **Rate limiting**  
  Consider rate limiting on Edge Functions (or at Supabase) to reduce abuse and cost.

- [ ] **Monitoring**  
  Sentry and Supabase dashboards; set alerts for errors and usage spikes.

---

## Quick reference

| Item              | Where / Command |
|-------------------|------------------|
| EAS Secrets       | `eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "..." --scope project` (then anon key, Sentry DSN) |
| EAS production build    | `npx eas build --platform ios --profile production` |
| Submit latest build     | `npx eas submit --platform ios --profile production --latest` |
| Supabase RLS            | Dashboard → Database → Tables → RLS |
| OpenAI limits           | platform.openai.com → Settings → Billing / Limits |
| App Store Connect       | appstoreconnect.apple.com |