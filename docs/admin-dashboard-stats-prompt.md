# Admin Dashboard — Pagination & Activity Statistics

## 0. Before You Write a Single Line

1. **Scan the entire moderation app** (Next.js, Vercel). Understand every page, component, data-fetching pattern, and how Supabase is queried from the web app.
2. **Scan the Supabase schema** via `src/types/database.types.ts` in the React Native repo and any existing migration files. Know what tables exist before creating new ones.
3. **Write your full plan** — every file to create or modify, every SQL object to add, in implementation order. Do not write code until the plan is reviewed.
4. **Branch**: do all work on `feature/admin-dashboard-stats`. Do not commit to main.

---

## 1. Part A — Collapsible Sections (Users, Admin Logs, Reports)

### What to change

The three sections — **User List**, **Admin Action Logs**, and **Reports** — currently load and render all rows at once. This makes the dashboard heavy and hard to scan.

Apply the same pattern to all three:

- **Default state:** Show the first 5 rows only. Display a subtle count label e.g. `"Showing 5 of 243 users"`.
- **Expand toggle:** A button below the list reads `"Show all X"` (where X is the total count). Tapping it reveals all rows with a smooth expand animation.
- **Collapse toggle:** When expanded, the same button reads `"Show less"`. Tapping it collapses back to 5 rows and scrolls the section back into view.
- **No pagination UI** (no page numbers, no previous/next buttons). This is a pure show-more/show-less collapse — all data is already fetched; only the rendered slice changes.
- The total count shown in the label must come from the existing query result, not a separate COUNT query.

### Implementation notes

- Extract a reusable `<CollapsibleSection>` component that accepts: `title`, `items`, `renderItem`, `defaultCount = 5`.
- The collapse/expand state is local (`useState`) — no server round-trips on toggle.
- Keep the existing row rendering logic unchanged — only wrap it in `CollapsibleSection`.
- The component should feel native to the dashboard's existing design system (same card styles, spacing, typography).

---

## 2. Part B — Activity Statistics Section

### Overview

Add a new **Activity Statistics** section to the dashboard, positioned prominently near the top (above the user list). It shows three metric groups:

1. **DAU / WAU / MAU** — broken into three activity tiers (Basic, Engaged, Action-oriented)
2. **Posts per day** — a 14-day bar chart (excluding deleted posts)
3. **Today's live snapshot** — DAU so far today, posts today

### 2a. Performance Architecture — Read This Carefully

**Never compute DAU/WAU/MAU with an inline `COUNT DISTINCT` query on every dashboard load.** Those queries scan the entire activity events table and will get slower as the app grows. Instead, use a two-layer architecture:

**Layer 1 — Event Ingestion (mobile app → Supabase)**

Create a lightweight `user_activity_events` table. The mobile app fires fire-and-forget inserts to this table for three event types. These inserts are non-blocking — they must not delay any UI action.

```sql
CREATE TABLE public.user_activity_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN (
    'session_start',      -- Basic: app opened / session created
    'engaged_session',    -- Engaged: user spent ≥10s on any screen
    'post_created',       -- Action: created a post
    'comment_created',    -- Action: created a comment
    'community_created'   -- Action: created a community
  )),
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for the daily aggregation job
CREATE INDEX idx_activity_events_occurred_at ON public.user_activity_events (occurred_at DESC);
CREATE INDEX idx_activity_events_user_date   ON public.user_activity_events (user_id, occurred_at DESC);

-- RLS: users can only insert their own events; nobody can read individual rows
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events"
  ON public.user_activity_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all events"
  ON public.user_activity_events FOR SELECT
  USING (public.get_my_is_admin());
```

**Layer 2 — Pre-aggregated Snapshots**

A Postgres function (called by a scheduled Supabase Edge Function daily at 00:05 UTC) writes yesterday's computed stats into a `daily_stats_snapshots` table. The dashboard only ever reads from this table — no live aggregation on demand.

```sql
CREATE TABLE public.daily_stats_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date               date NOT NULL,
  university_id               uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  -- NULL university_id = platform-wide aggregate

  -- DAU variants (unique users with ≥1 event of that tier on this date)
  dau_basic                   int NOT NULL DEFAULT 0,
  dau_engaged                 int NOT NULL DEFAULT 0,
  dau_action                  int NOT NULL DEFAULT 0,

  -- WAU/MAU are computed from rolling windows, not stored per day
  -- (dashboard computes them by summing/distinct-ing daily snapshots for 7/30 day windows)
  
  -- Posts
  posts_created               int NOT NULL DEFAULT 0,  -- new posts on this date (is_deleted = false)

  computed_at                 timestamptz NOT NULL DEFAULT now(),

  UNIQUE (snapshot_date, university_id)
);

CREATE INDEX idx_snapshots_date ON public.daily_stats_snapshots (snapshot_date DESC);

ALTER TABLE public.daily_stats_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read snapshots"
  ON public.daily_stats_snapshots FOR SELECT
  USING (public.get_my_is_admin());
CREATE POLICY "Service role can write snapshots"
  ON public.daily_stats_snapshots FOR ALL
  USING (true)  -- restricted by service role key usage in the edge function
  WITH CHECK (true);
```

**Layer 3 — Daily Aggregation Edge Function**

Create `supabase/functions/compute-daily-stats/index.ts`. Called by a cron schedule (Supabase Dashboard → Edge Functions → Schedule, or `pg_cron`): `5 0 * * *` (00:05 UTC daily).

Logic:
1. Determine `target_date` = yesterday (UTC).
2. For each `university_id` AND for `NULL` (platform-wide), compute:
   - `dau_basic`: `COUNT(DISTINCT user_id) WHERE event_type = 'session_start' AND date(occurred_at) = target_date`
   - `dau_engaged`: `COUNT(DISTINCT user_id) WHERE event_type = 'engaged_session' AND date(occurred_at) = target_date`
   - `dau_action`: `COUNT(DISTINCT user_id) WHERE event_type IN ('post_created','comment_created','community_created') AND date(occurred_at) = target_date`
   - `posts_created`: `COUNT(*) FROM posts WHERE date(created_at) = target_date AND is_deleted IS NOT TRUE`
3. Upsert into `daily_stats_snapshots` (on conflict `(snapshot_date, university_id)` do update).
4. Return summary JSON.

**"Today so far" (live overlay)**

The dashboard makes ONE lightweight query for the current day — not on every render, but on mount with a 5-minute `staleTime`:

```sql
-- Today's basic DAU so far
SELECT COUNT(DISTINCT user_id)
FROM user_activity_events
WHERE occurred_at >= date_trunc('day', now())
  AND event_type = 'session_start';
```

This query is cheap because it only scans today's rows (small, recent, indexed by `occurred_at DESC`).

**WAU / MAU computation on the dashboard**

Do NOT store WAU/MAU in the snapshots table. Compute them client-side from the snapshots:
- **WAU**: fetch the last 7 daily snapshots, sum `dau_basic` (this is an approximation; good enough for a dashboard).
- **MAU**: fetch the last 30 daily snapshots, sum `dau_basic`.
- For precise unique-user WAU/MAU (deduplicating users who were active on multiple days), run this query max once per dashboard load with a 1-hour cache:

```sql
-- Precise WAU basic
SELECT COUNT(DISTINCT user_id)
FROM user_activity_events
WHERE occurred_at >= now() - interval '7 days'
  AND event_type = 'session_start';
```

Use SWR or React Query with `staleTime: 60 * 60 * 1000` (1 hour) for these precise queries. They are expensive; caching is mandatory.

---

### 2b. Mobile App Changes (React Native / Expo)

Add a fire-and-forget event logging utility in the React Native app at `src/utils/activityLogger.ts`:

```typescript
import { supabase } from '../lib/supabase';

type ActivityEvent = 
  | 'session_start'
  | 'engaged_session'
  | 'post_created'
  | 'comment_created'
  | 'community_created';

/**
 * Fire-and-forget. Never awaited in UI code. Never throws.
 * Call this after the user action is already complete — do not block on it.
 */
export function logActivity(
  eventType: ActivityEvent,
  universityId: string,
): void {
  supabase
    .from('user_activity_events')
    .insert({ event_type: eventType, university_id: universityId })
    .then(() => {/* no-op */})
    .catch(() => {/* silent — never let logging break the UI */});
}
```

**Where to call it — add these calls without modifying any business logic:**

| Event | Where to add the call |
|---|---|
| `session_start` | `src/context/AuthContext.tsx` — inside the `onAuthStateChange` handler when `event === 'SIGNED_IN'` or `event === 'TOKEN_REFRESHED'`. Once per session. |
| `engaged_session` | `src/app/(protected)/(tabs)/index.tsx` — fire after the feed has been mounted for 10 seconds (`useEffect` with a 10-second `setTimeout`, cleared on unmount). |
| `post_created` | `src/features/posts/hooks/useCreatePost.ts` (or wherever the post mutation's `onSuccess` fires) — call `logActivity('post_created', universityId)` in `onSuccess`. |
| `comment_created` | `src/features/comments/hooks/useCreateComment.ts` — `onSuccess`. |
| `community_created` | `src/features/communities/hooks/useCommunityMutations.ts` — `onSuccess` of the create mutation. |

**Critical constraints:**
- `logActivity` is always called AFTER the primary action succeeds (`onSuccess`), never before.
- It is never `await`-ed in any component or hook.
- If `universityId` is unavailable at the call site, skip the call (do not log with a null ID).
- Add a `__DEV__` guard: in development, log to console instead of inserting to the database to avoid polluting stats.

---

### 2c. Dashboard UI — Statistics Section

Add a `<ActivityStats>` component to the moderation dashboard. Position it as the first section after the page header.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Activity Statistics                    [Last refreshed: Xs] │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     DAU      │  │     WAU      │  │     MAU      │      │
│  │  Basic  142  │  │  Basic  891  │  │  Basic 2,341 │      │
│  │ Engaged  67  │  │ Engaged 410  │  │ Engaged 1,102│      │
│  │ Action   23  │  │ Action  156  │  │ Action   487 │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Posts per day (last 14 days)                               │
│  ▄ ▆ █ ▄ ▅ █ ▆ ▄ ▅ ▄ ▇ █ ▃ ▅   ← simple bar chart         │
│                                                             │
│  Today so far: DAU 34 (basic) · Posts 12                   │
└─────────────────────────────────────────────────────────────┘
```

**Data fetching strategy for the stats component:**

| Data | Query | Cache / staleTime |
|---|---|---|
| 14-day snapshots (chart + DAU/WAU/MAU approx) | `daily_stats_snapshots ORDER BY snapshot_date DESC LIMIT 30` | 30 minutes |
| Precise WAU (7-day distinct users) | Single SQL COUNT DISTINCT | 1 hour |
| Precise MAU (30-day distinct users) | Single SQL COUNT DISTINCT | 1 hour |
| Today's live DAU | `user_activity_events` WHERE today | 5 minutes |
| Today's live posts | `posts` WHERE today AND not deleted | 5 minutes |

Use whichever data-fetching library the dashboard already uses (SWR or React Query). If neither is installed, use SWR (`swr`) — it's the standard for Next.js.

**Metric definitions — show these as tooltips on hover:**
- **Basic:** App opened / session started
- **Engaged:** Spent ≥10 seconds in the app
- **Action-oriented:** Created a post, comment, or community

**Bar chart:** Use a CSS-only or lightweight approach. Do NOT add a heavy charting library (no Recharts, no Chart.js) just for this. Implement with a simple `<div>` bar chart using CSS `height` proportional to the max value. Keep it clean, not fancy.

**Loading states:** Each stat card shows a skeleton/shimmer while loading. The cards are independent — a slow WAU query should not block DAU from rendering.

**Error states:** If a query fails, show "—" in place of the number with a muted error icon. Do not crash the page.

**University filter:** If the dashboard already has a university selector, respect it — filter all stats queries by `university_id`. If no selector exists, show platform-wide stats only (where `university_id IS NULL` in the snapshots).

---

## 3. Database Migration

Create a single migration file: `supabase/migrations/<timestamp>_activity_stats.sql`

It must include, in order:
1. `user_activity_events` table + indexes + RLS policies
2. `daily_stats_snapshots` table + indexes + RLS policies
3. A `compute_daily_stats(target_date date)` Postgres function that the Edge Function calls (so the logic lives in SQL and is testable)

---

## 4. Do Not

- Do not add `await` to any `logActivity()` call in the mobile app.
- Do not run the DAU/WAU/MAU aggregation on every dashboard request — use snapshots.
- Do not add any activity logging to anonymous post/comment paths (the `is_anonymous` flow does not produce an activity event for the content, but `session_start` is still logged since the user is authenticated).
- Do not install a new heavy charting library. Use CSS or a minimal solution.
- Do not change any existing dashboard functionality — only add the stats section and apply the collapse pattern to existing lists.
- Do not expose `user_activity_events` raw rows to the dashboard UI — only aggregated numbers.

---

## 5. Definition of Done

- [ ] `user_activity_events` table created with correct schema, indexes, RLS
- [ ] `daily_stats_snapshots` table created with correct schema, indexes, RLS
- [ ] `compute_daily_stats` Postgres function created and tested
- [ ] `compute-daily-stats` Edge Function created and scheduled (00:05 UTC daily)
- [ ] `activityLogger.ts` utility created in mobile app with `__DEV__` guard
- [ ] All 5 event types wired up in the correct mobile app hooks/contexts (fire-and-forget only)
- [ ] Dashboard: `CollapsibleSection` component — users, logs, reports all show 5 rows by default with expand/collapse
- [ ] Dashboard: `ActivityStats` section renders DAU/WAU/MAU (3 tiers), 14-day posts chart, today live snapshot
- [ ] All dashboard data fetching uses appropriate `staleTime` caching per the table above
- [ ] No performance regression on the mobile app (logging is always async, never blocking)
- [ ] All new code is TypeScript strict — no `any`
