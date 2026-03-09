## Scalability Assessment

**Plan note**: Pro gives you 100K MAU, 8GB DB, 250GB egress. The plan is not the bottleneck — your code architecture is. Upgrading to Pro is the right call and removes the free-tier ceiling, but it doesn't fix the issues below.

---

## 500 users — ✅ Done

Everything works. The fixes already made (indexes, `posts_summary_view` user_vote join, `useGlobalUnreadCount` cache derivation) are enough. No action needed beyond upgrading to Pro.

---

## 1,000 users — ✅ Done

### ~~Issue 1 — "hot" feed fetches 100 rows, sorts client-side~~ ✅ FIXED

**What was done**: Added a `post_stats` denormalised table with a stored generated `hot_score` column (`ABS(vote_score) + comment_count + repost_count`), indexed on `hot_score DESC`. The "hot" feed now fetches 10 rows per page and sorts server-side with `.order("hot_score", { ascending: false })`. The client-side `.sort()` in `useMemo` was removed entirely.

Migration: `supabase/migrations/20260308100000_post_stats_table.sql`

### Issue 2 — `send-push-notification` has sequential per-user DB calls (MEDIUM)

The function fetches up to 100 notifications, then for each unique user in the chat bucket makes individual `profiles` queries and `user_chats_summary` queries in a loop. A post that gets 80 likes triggers 80+ sequential DB calls in one Edge Function invocation.

**Fix**: Batch the profile fetches with a single `.in("id", allUserIds)` before the loop, and batch the badge count queries.

---

## 5,000 users — ✅ Done (Issues 3 & 4)

### ~~Issue 3 — All Realtime subscriptions have no `filter:` param~~ ✅ FIXED

**What was done**:

**`chat.tsx`**: Replaced the single unfiltered `chats-realtime-${userId}` channel (5 handlers, including 2 `chat_messages` listeners) with **two filtered channels**:
- `chats-p1-${userId}` — `filter: participant_1_id=eq.${userId}`
- `chats-p2-${userId}` — `filter: participant_2_id=eq.${userId}`

Both share a single `handleChatEvent` function. The `chat_messages` INSERT/UPDATE listeners were removed — the `chats` UPDATE event is sufficient to keep the list current.

**`_layout.tsx`** (`useGlobalUnreadCount`): Removed both `chat_messages` Realtime listeners entirely. Set `staleTime: Infinity` on the `useQuery`. The badge is now kept current exclusively by `chat.tsx`'s `handleChatEvent` calling `setQueriesData`.

> One-time Supabase dashboard step: In **Database → Replication → Realtime**, enable row-level security for the `chat_messages` table so the detail-screen subscription only receives rows the authenticated user has RLS access to.

**Remaining**: The `"posts-feed"` subscription in `index.tsx` still has no filter. Add `filter: "post_type=eq.feed"` to avoid receiving lost_found inserts. Low priority.

### ~~Issue 4 — `posts_summary_view` has 4 correlated subqueries per row~~ ✅ FIXED

**What was done**: Created a `post_stats` table with `comment_count`, `vote_score`, `repost_count`, and a stored generated `hot_score` column. Four trigger functions keep it in sync:
- `fn_init_post_stats` — inserts a zero row on post creation
- `fn_update_vote_score` — fires on `votes` INSERT/UPDATE/DELETE
- `fn_update_comment_count` — fires on `comments` INSERT/UPDATE/DELETE (handles soft-deletes)
- `fn_update_repost_count` — fires on `posts` INSERT/DELETE where `reposted_from_post_id IS NOT NULL`

`posts_summary_view` was recreated to use `LEFT JOIN post_stats` instead of the 3 correlated subqueries. `user_vote` stays as the only remaining subquery (session-specific). A backfill `INSERT … ON CONFLICT DO UPDATE` populated all existing posts.

Migration: `supabase/migrations/20260308100000_post_stats_table.sql`

### Issue 5 — `"global-unread-count"` AppState listener hits `user_chats_summary` on every foreground (HIGH)

```ts
// _layout.tsx — fires every time user brings app to foreground
AppState.addEventListener("change", (nextState) => {
  if (nextState === "active") {
    queryClient.refetchQueries({ queryKey: ["global-unread-count", ...] });
  }
});
```

With 5,000 users commuting/lunch-breaking, you get hundreds of simultaneous app-foreground events per minute, each querying `user_chats_summary`.

**Fix**: Use the `chat-summaries` cache (already in memory) to derive the badge count instead of querying the DB on foreground. The realtime path already does this — extend the same pattern to the AppState path.

---

## 10,000 users — 🔴🔴 Needs architectural changes before hitting this scale

### Issue 6 — Static channel name `"global-unread-count"` (HIGH)

```ts
supabase.channel("global-unread-count") // same string for ALL users
```

All 10,000 users subscribe to the same channel name. The channel has **no filter**, so every `chat_messages` INSERT is evaluated for 10,000 connections on the Supabase Realtime server.

**Fix**: Rename to `"global-unread-count-${currentUserId}"` and at 10K scale, move badge updating to push notifications only (the badge is already set correctly by `send-push-notification`).

### Issue 7 — Connection pool exhaustion (HIGH)

Your Supabase client uses the direct Postgres port (`5432`). Each concurrent API request holds an open DB connection. Pro plan's dedicated instance allows ~60–200 direct connections. At 10K MAU with 1,000 concurrent users, simultaneous requests can exhaust this.

**Fix**: Switch the Supabase client to the **connection pooler URL** (port `6543`, transaction mode). In your Supabase dashboard → Settings → Database → Connection string, use the pooler URL in your `EXPO_PUBLIC_SUPABASE_URL` environment variable for API calls. Edge Functions already use the service-role client and should use the pooler too.

### Issue 8 — Storage egress budget (MEDIUM)

Pro includes 250 GB/month. At 10K users viewing an average of 20 images per session per day:
- If average image = 300 KB (WEBP compressed): 10K × 20 × 300 KB × 30 days = **1.8 TB/month**
- That's 7× the included egress → ~$135/month in overage at $0.09/GB

**Fix**: Enable Supabase CDN (already included with public buckets — just ensure `Cache-Control: max-age` headers are set on storage uploads). Your `uploadImage` utility already sets `cacheControl: '3600'` which activates Supabase's edge CDN. The 250 GB limit applies to **cached** egress at $0.03/GB, so the effective cost is much lower. Still, at 10K users monitor this.

---

## Priority order for your roadmap

| Priority | Fix | Status | Blocks which scale |
|---|---|---|---|
| 🔴 #1 | Replace `posts_summary_view` subqueries with `post_stats` trigger table | ✅ Done | 5K+ |
| 🔴 #2 | Remove unfiltered Realtime subscriptions from `chat.tsx` and `_layout.tsx` | ✅ Done | 5K+ |
| 🔴 #3 | Fix "hot" feed to sort server-side, fetch 10 rows not 100 | ✅ Done | 1K+ |
| 🟡 #4 | Batch DB queries in `send-push-notification` | Pending | 1K+ |
| 🟡 #5 | Derive badge from `chat-summaries` cache on AppState foreground | Pending | 5K+ |
| 🟢 #6 | Switch to pooler URL (port 6543) | Pending | 10K+ |
| 🟢 #7 | Per-user channel name for `global-unread-count` | Pending | 10K+ |

**Bottom line**: With Pro and fixes #1–#3 complete, you're solid through 5,000 users. Fixes #4–#7 get you comfortably to 10,000+.
