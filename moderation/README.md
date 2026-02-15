# UniTee Moderation

Admin-only web dashboard for user moderation: list users (with search), ban/unban, and view reports.

## Setup

1. **Environment**
   - Copy `.env.local.example` to `.env.local`
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same as main app)

2. **RLS**
   - Run `sql/rls_moderation_admin.sql` in the Supabase SQL Editor (from repo root) so admins can read all profiles and reports.

3. **Edge Functions**
   - Deploy: `supabase functions deploy unban-user` (and `ban-user` if not already deployed)

4. **Run**
   ```bash
   cd moderation
   npm install
   npm run dev
   ```
   Open http://localhost:3000 and sign in with an **admin** account (a user whose `profiles.is_admin` is `true`).

## Features

- **Login** – Supabase Auth (email/password)
- **Dashboard** – Shown only if the signed-in user has `profiles.is_admin = true`
- **Users** – Table of all profiles with search by username/id; Ban (with duration) and Unban buttons
- **Reports** – Table of all reports (reason, status, post/comment id, created_at)
- **Sign out**

## Ban / Unban

- **Ban** calls the `ban-user` Edge Function (body: `user_id`, `duration`: 10_days | 1_month | 1_year | permanent).
- **Unban** calls the `unban-user` Edge Function (body: `user_id`).

Both functions require the caller to be an admin and use the service role server-side to update `profiles`.
