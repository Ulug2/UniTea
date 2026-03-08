Now I have the full picture. Let me give you a precise, honest assessment.

---

## Scalability Assessment

**Plan note**: Pro gives you 100K MAU, 8GB DB, 250GB egress. The plan is not the bottleneck — your code architecture is. Upgrading to Pro is the right call and removes the free-tier ceiling, but it doesn't fix the issues below.

---

## 500 users — ✅ Fine

Everything works. The fixes already made (indexes, `posts_summary_view` user_vote join, `useGlobalUnreadCount` cache derivation) are enough. No action needed beyond upgrading to Pro.

---

## 1,000 users — ⚠️ Noticeable slowdowns, two things to fix

### Issue 1 — "hot" feed fetches 100 rows, sorts client-side (HIGH)

```ts
// index.tsx
.gte("created_at", last7Days)
.order("created_at", desc)
.range(0, 99) // ← 100 rows, not 10
// then sorted in JS by a composite score
```

Every "hot" tab page load pulls 100 full `posts_summary_view` rows. Each row runs 4 correlated subqueries (comment_count, vote_score, user_vote, repost_count). So one hot-feed load = **400 DB subqueries**. At 100 concurrent users refreshing, that's 40,000 subqueries/second just from this tab.

**Fix**: Add a `hot_score` column to `posts` (updated via a DB trigger or Edge Function on insert/vote) and sort server-side with `.range(0, 9)`.

### Issue 2 — `send-push-notification` has sequential per-user DB calls (MEDIUM)

The function fetches up to 100 notifications, then for each unique user in the chat bucket makes individual `profiles` queries and `user_chats_summary` queries in a loop. A post that gets 80 likes triggers 80+ sequential DB calls in one Edge Function invocation.

**Fix**: Batch the profile fetches with a single `.in("id", allUserIds)` before the loop, and batch the badge count queries.

---

## 5,000 users — 🔴 Critical, needs fixes before launch at this scale

### Issue 3 — All Realtime subscriptions have no `filter:` param (CRITICAL)

```
chat.tsx        → table: "chats"         no filter
chat.tsx        → table: "chat_messages" no filter  ← biggest issue
_layout.tsx     → table: "chat_messages" no filter
index.tsx       → table: "posts"         no filter
```

Supabase Realtime with `postgres_changes` and no filter delivers **every matching row event to every subscribed client**. At 5,000 concurrent users:

- Every new chat message is broadcast to all ~5,000 connected clients
- Each client receives the event, runs the `if (newMessage.user_id === currentUserId) return` guard and discards it (999 out of 1,000 times)
- This is pure wasted bandwidth and CPU — scales O(N²) with message volume × user count

The only correctly scoped subscription in your codebase is `chat-${chatId}` in `realtime.ts` which uses `filter: "chat_id=eq.${chatId}"`. All others need the same treatment.

**Fix for chat list (`chat.tsx`)**: Supabase supports `filter: "participant_1_id=eq.${userId}"` but not `OR` conditions in postgres_changes filters. The proper solution is to **stop using postgres_changes for the chat list** and instead rely on the per-chat subscription + periodic background refetch (which you already have with `staleTime: 5min`). The realtime handler in `chat.tsx` is clever but redundant when the detail-screen subscription (`chat-${chatId}`) already handles the canonical update path.

**Fix for feed (`index.tsx`)**: The `"posts-feed"` subscription just marks the cache stale — this is acceptable low-cost behavior. But add `filter: "post_type=eq.feed"` to avoid receiving lost_found inserts.

### Issue 4 — `posts_summary_view` has 4 correlated subqueries per row (CRITICAL)

Every feed page (10 posts) hits the DB with the equivalent of:

```sql
-- runs once per post row in the result set:
SELECT COUNT(*)  FROM comments WHERE post_id = p.id AND is_deleted = false
SELECT SUM(...)  FROM votes   WHERE post_id = p.id
SELECT vote_type FROM votes   WHERE post_id = p.id AND user_id = auth.uid()
SELECT COUNT(*)  FROM posts   WHERE reposted_from_post_id = p.id
```

That's 40 extra queries per feed page. With 500 concurrent users browsing, the DB is executing ~20,000 correlated subqueries per second. PostgreSQL can handle this at small scale, but it degrades badly under concurrent load.

**Fix**: Create a `post_stats` table (`post_id, comment_count, vote_score, repost_count`) updated by database triggers. Rewrite the view to use a simple JOIN instead of subqueries. `user_vote` can stay as a subquery since it's per-session. This is the single highest-leverage change for your entire backend.

### Issue 5 — `"global-unread-count"` AppState listener hits `user_chats_summary` on every foreground (HIGH)

```ts
// _layout.tsx — fires every time user brings app to foreground
AppState.addEventListener("change", (nextState) => {
  if (nextState === "active") {
    queryClient.refetchQueries({ queryKey: ["global-unread-count", ...] });
  }
});
```

With 5,000 users commuting/lunch-breaking, you get hundreds of simultaneous app-foreground events per minute, each querying `user_chats_summary`. This view is not tracked in your migrations (was created directly in the Supabase dashboard) — if it has correlated subqueries, it compounds with Issue 4.

**Fix**: Use the `chat-summaries` cache (already in memory) to derive the badge count instead of querying the DB on foreground. You already did this for the realtime path in `_layout.tsx` — extend the same pattern to the AppState path.

---

## 10,000 users — 🔴🔴 Needs architectural changes before hitting this scale

### Issue 6 — Static channel name `"global-unread-count"` (HIGH)

```ts
supabase.channel("global-unread-count") // same string for ALL users
```

All 10,000 users subscribe to the same channel name. Supabase creates a separate channel instance per client connection so this doesn't cause a logical conflict, but it does mean the channel name gives you zero debug visibility into per-user state. More importantly, the channel has **no filter**, so every `chat_messages` INSERT is evaluated for 10,000 connections on the Supabase Realtime server.

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

| Priority | Fix | Blocks which scale |
|---|---|---|
| 🔴 #1 | Replace `posts_summary_view` subqueries with `post_stats` trigger table | 5K+ |
| 🔴 #2 | Remove unfiltered Realtime subscriptions from `chat.tsx` and `_layout.tsx` | 5K+ |
| 🔴 #3 | Fix "hot" feed to sort server-side, fetch 10 rows not 100 | 1K+ |
| 🟡 #4 | Batch DB queries in `send-push-notification` | 1K+ |
| 🟡 #5 | Derive badge from `chat-summaries` cache on AppState foreground | 5K+ |
| 🟢 #6 | Switch to pooler URL (port 6543) | 10K+ |
| 🟢 #7 | Per-user channel name for `global-unread-count` | 10K+ |

**Bottom line**: With Pro and fixes #1–#3, you're solid through 5,000 users. Fixes #4–#7 get you comfortably to 10,000+.