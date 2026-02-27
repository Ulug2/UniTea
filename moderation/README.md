# UniTee Moderation

Admin-only web dashboard for user moderation: manage users, reports, and track all admin actions with a full audit log.

## Setup

1. **Environment**
   - Copy `.env.local.example` to `.env.local`
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same as main app)

2. **Database migrations** – run all of the following in the Supabase SQL Editor (from repo root):
   - `sql/rls_moderation_admin.sql` – RLS policies so admins can read all profiles and reports
   - `sql/create_admin_action_logs.sql` – creates the `admin_action_logs` table used for the audit log

3. **Edge Functions** – deploy (or redeploy after the logging changes):
   ```bash
   supabase functions deploy ban-user
   supabase functions deploy unban-user
   supabase functions deploy delete-post
   ```

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
- **Users** – Table of all profiles with search by username/id and filter by ban status; Ban (with duration) and Unban buttons
- **Reports** – Table of all reports with an interactive status badge; click any status to update it inline
- **Admin Action Logs** – Full audit trail of every ban, unban, and admin-initiated post deletion; filterable by action type
- **Sign out**

## Ban / Unban

- **Ban** calls the `ban-user` Edge Function (body: `user_id`, `duration`: `10_days` | `1_month` | `1_year` | `permanent`).
- **Unban** calls the `unban-user` Edge Function (body: `user_id`).

Both functions require the caller to be an admin, use the service role server-side to update `profiles`, and insert a row into `admin_action_logs`.

## Report Status

Click the coloured status badge on any report row to open a dropdown and change the status:

| Status | Meaning |
|---|---|
| **Pending** | Newly submitted, not yet reviewed |
| **Working on it** | Under active review by an admin |
| **Resolved** | Action taken; `resolved_at` is stamped automatically |

Changes are written directly to the `reports` table via the Supabase client (admin RLS policy required).

## Admin Action Logs

Every moderation action is recorded in `admin_action_logs`:

| Column | Description |
|---|---|
| `admin_id` | The admin who performed the action |
| `action` | `ban`, `unban`, or `delete_post` |
| `target_user_id` | The affected user |
| `target_post_id` | The deleted post (for `delete_post` actions) |
| `metadata` | Extra context (e.g. ban duration, `banned_until`) |
| `created_at` | Timestamp of the action |

The dashboard shows the 500 most recent entries with pill-style filter tabs (All / Ban / Unban / Delete Post) and resolves admin/target names from the loaded profiles list.
