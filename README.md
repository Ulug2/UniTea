# UniTee

**Your anonymous university community.**

UniTee is a mobile community for university students: post to the feed, help others find lost items, chat 1:1, and join discussions — with **optional anonymity** that still preserves safety and accountability.

- **Status**: Live on iOS (App Store). Android (Google Play) coming soon.
- **Deep links**: `unitea.app` (supports `/post/*` and `/lostfoundpost/*`).
- **Bundle IDs**: iOS `com.unitea.app`, Android `com.unitea.app`.

## Key product capabilities

- **Feed + Lost & Found**: Two post types backed by a unified schema and denormalized summary view for fast listing.
- **Comments**: Nested threads, including a per-post stable anonymous identifier (`post_specific_anon_id`).
- **Voting + ranking**: Vote aggregation and time-decayed “hot” scoring via DB views/triggers.
- **Chat**: Direct messaging, including “anonymous chats” tied to post context.
- **Safety + moderation**:
  - In-app reporting, blocking, notifications
  - AI-assisted moderation on post/comment creation (Edge Functions)
  - Separate admin moderation dashboard with a full audit log
- **Reliability**: Sentry integration, Expo push notifications, client-side caching (TanStack Query).

## Tech stack

### Mobile app

- **Expo + React Native**: Expo SDK 54, React 19, React Native 0.81
- **Routing**: Expo Router
- **Server state**: TanStack Query v5
- **Error tracking**: Sentry (`@sentry/react-native`)
- **Push**: `expo-notifications` + Expo Push Tokens

### Backend

- **Supabase**: Postgres + Auth + Realtime + Storage
- **Edge Functions (Deno)**:
  - AI moderation on create (`create-post`, `create-comment`)
  - Push delivery (`send-push-notification`)
  - Admin actions (`ban-user`, `unban-user`, `delete-post`, `delete-comment`)
  - Utility (`check-email-exists`)

### Admin tooling

- **Moderation dashboard**: Next.js app in `moderation/` (admin-only, Supabase Auth)

## Repo layout

```text
.
├── src/                     # Mobile app source (Expo Router, features, hooks)
├── assets/                  # App assets
├── app.json                 # Expo config (bundle IDs, deep links, plugins)
├── eas.json                 # EAS build/submit profiles
├── supabase/
│   ├── migrations/          # Postgres migrations (views, triggers, schema changes)
│   ├── functions/           # Edge Functions (moderation, push, admin actions)
│   └── config.toml
├── moderation/              # Next.js admin dashboard for moderation + audit log
├── sql/                     # One-off SQL scripts (RLS, admin logs, constraints, etc.)
└── docs/                    # Release + operational runbooks
```

## Local development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Expo](https://docs.expo.dev/get-started/installation/)
- [Supabase](https://supabase.com/) project (or local Supabase via CLI)

### Mobile app setup (root)

Install dependencies:

```bash
npm install
```

Create `.env` in repo root (do not commit it):

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...

# Optional
EXPO_PUBLIC_SENTRY_DSN=...
# Used in release/share flows in docs
EXPO_PUBLIC_APP_URL=https://unitea.app
```

Run the app:

```bash
npm start
```

Platform-specific (native) runs:

```bash
npm run ios
npm run android
```

### Tests

```bash
npm test
```

### Supabase (DB + Edge Functions)

- **Migrations**: live under `supabase/migrations/` (views, triggers, ranking, chat schema, image metadata, etc.)
- **Edge Functions secrets** (set via Supabase secrets for deployed functions):
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (required for admin functions and utilities)
  - `OPENAI_API_KEY` (required for AI moderation functions)

Generate updated DB types (requires Supabase CLI access to the project):

```bash
npm run types
```

## Moderation dashboard (admin web)

The admin dashboard lives in `moderation/` and requires an account with `profiles.is_admin = true`.

Setup:

- Copy `.env.local.example` → `.env.local`
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Run DB scripts (from repo root) in the Supabase SQL Editor:
  - `sql/rls_moderation_admin.sql`
  - `sql/create_admin_action_logs.sql`
- Deploy Edge Functions used by moderation:

```bash
supabase functions deploy ban-user
supabase functions deploy unban-user
supabase functions deploy delete-post
```

Run locally:

```bash
cd moderation
npm install
npm run dev
```

## Releases

This repo uses **EAS** (`eas.json`) with `development`, `preview`, and `production` profiles.

- **iOS (TestFlight/App Store)**: see `docs/EAS_BUILD_TESTFLIGHT.md`
- **Android (Google Play)**: see `docs/google-play-android.md`
  - Includes `.well-known/assetlinks.json` hosting requirements for `unitea.app`

## Security and privacy

- **RLS-first**: Supabase Row Level Security is used to protect user data.
- **Optional anonymity**: anonymity is a product feature, not “no account”; server-side rules still apply.
- **Least privilege on device**: the Android config blocks sensitive permissions like microphone recording.

## License

MIT. See `LICENSE`.