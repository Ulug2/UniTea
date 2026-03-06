Now I have a thorough picture. Let me give you the real assessment.

---

## Scalability Analysis

### TL;DR by scale

| Users | Status | What happens |
|-------|--------|--------------|
| 500 | ✅ Mostly fine | Free tier strains on realtime connections at peak |
| 1,000 | ⚠️ Upgrade needed | Pro plan required; N+1 push notifications slow down; view queries get expensive |
| 5,000 | ❌ Will lag/fail | Multiple structural issues hit simultaneously |
| 10,000 | ❌ Will crash | Architecture changes needed, not just upgrades |

---

## Issues by priority

### 🔴 Critical (will break at 5K+)

**1. `posts_summary_view` is almost certainly un-materialized**

Every feed load (`FlatList`, "hot", "new", "top") queries `posts_summary_view`. This view joins `posts` + `votes` + `comments` + `profiles` at minimum to produce `vote_score`, `comment_count`, etc. Without materialization, at 5,000 users with thousands of posts, each feed page load runs a full multi-table aggregation scan at query time. This is the single biggest bottleneck. At 1,000 concurrent users all scrolling, you'd see 5-10 second feed loads.

**Fix:** Materialize the view and refresh it on a schedule (e.g. every 2 minutes via `pg_cron`), or add the aggregated columns (`vote_score`, `comment_count`, `repost_count`) directly to the `posts` table and update them with triggers.

---

**2. "Hot" filter fetches 100 rows and sorts client-side**

```tsx
// index.tsx line ~99-104
const hotFrom = pageParam * 100;
const hotTo = hotFrom + 99;
query = query
  .gte("created_at", last7Days.toISOString())
  .order("created_at", { ascending: false })
  .range(hotFrom, hotTo);
```

Then on the device, in `useMemo`, it re-sorts all accumulated rows by a manually computed engagement score. At 5K users with 2K posts in the past 7 days, page 2 fetches rows 100-199, you accumulate 200 posts on device and sort them all in JS every re-render. With rapid incoming new posts (via background refetches), this `useMemo` runs constantly on the main thread.

**Fix:** Move the engagement ranking to a database-level column (`engagement_score`) updated by trigger, and let the DB sort.

---

**3. Missing critical database indexes**

Your schema has no explicit indexes beyond primary keys and FK constraints. These are all full sequential scans at scale:

```sql
-- Feed: every page load does this scan without an index
posts(post_type, created_at DESC)   -- "new" filter
posts(post_type, vote_score DESC)   -- "top" filter
posts(post_type, is_deleted, created_at) -- combined filtering

-- Chat: every chat detail load, every mark-as-read
chat_messages(chat_id, created_at DESC)
chat_messages(is_read, user_id)

-- Push notifications (see below)
notifications(user_id, is_read, push_sent)
notifications(push_sent, is_read)   -- the function scans ALL unread+unsent rows

-- Votes
votes(post_id)
votes(user_id, post_id)  -- missing UNIQUE, also missing compound index
```

At 1,000 users with 10K posts, a sequential scan of `posts` filtered by `post_type` touches all rows. Add this index and queries drop from 500ms to 5ms.

---

### 🟠 Major (will lag at 1K–5K)

**4. Push notification function is N+1 sequential DB queries**

In `send-push-notification/index.ts`, for each of N users receiving a notification:

```ts
// For each user in a for loop — sequential, not parallel
const senderUsername = await getSenderUsername(senderId);  // 1 DB query
const unreadChatCount = await getUnreadChatCount(userId);  // 1 DB query to user_chats_summary
await supabase.from("notifications").update(...)           // 1 DB query
await supabase.from("notifications").select(...)           // 1 DB query (verify)
await fetch(EXPO_PUSH_API_URL, ...)                        // 1 external HTTP call
```

That's 5 operations per user, all sequential. If 20 users get notified at once, that's 100 sequential operations in a single Edge Function invocation. Each `getUnreadChatCount` runs the full `user_chats_summary` view join for that user. At 1K active users, this function can time out (Edge Functions have a 150-second limit).

**Fix:** Batch the sender lookups and unread counts into 2 queries total using `.in()`, then parallelize the Expo push calls using `Promise.all`. Use Expo's batch push endpoint (`/v2/push/send` accepts an array).

---

**5. Realtime subscriptions with no row-level filter**

Every user who has the chat tab open maintains this channel:

```tsx
// chat.tsx
supabase.channel(`chats-realtime-${currentUserId}`)
  .on("postgres_changes", { event: "INSERT", table: "chat_messages" }, ...)
  // No filter: — receives ALL chat_messages inserts from all users
```

And separately in the tab layout, every user also holds:

```tsx
// _layout.tsx tabs
supabase.channel("global-unread-count")
  .on("postgres_changes", { event: "INSERT", table: "chat_messages" }, ...)
```

At 1,000 concurrent users, every single chat message is broadcast to 1,000 realtime connections. Supabase Realtime multiplexes this but it's still O(users × messages/sec). At 5,000 concurrent users with 10 messages/second between conversations, that's 50,000 events/second being routed.

**Fix:** Add a `filter:` to the subscriptions so each client only receives events relevant to their chats:

```ts
.on("postgres_changes", {
  event: "INSERT",
  schema: "public",
  table: "chat_messages",
  filter: `chat_id=in.(${userChatIds.join(",")})`,
}, ...)
```

This requires knowing the user's chat IDs upfront (you already have them from `chatSummaries`).

---

**6. `useGlobalUnreadCount` triggers a full DB refetch for every message any user sends**

In `_layout.tsx` tabs:

```tsx
debounceRef.current = setTimeout(() => {
  queryClient.refetchQueries({
    queryKey: ["global-unread-count", currentUserId],
    exact: false,
  });
}, 500);
```

This query hits `user_chats_summary` (a potentially expensive view) for every user, every time any message arrives. At 500 chatting users, each sending 1 message/minute = ~8 messages/second → 8 × 500 = 4,000 view queries/minute from this one hook alone.

You already have the smart cache update logic in `chat.tsx` that increments `unread_count_p1/p2` locally. The `global-unread-count` channel is redundant in most cases. You could remove the `refetchQueries` call and rely entirely on the local cache mutations.

---

**7. Missing UNIQUE constraint on `votes(user_id, post_id)`**

```sql
-- From schema — no UNIQUE constraint visible
CREATE TABLE public.votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid,
  ...
```

A race condition (user taps vote quickly, or network retry) can insert duplicate votes. At 5K users with active voting, you'd see posts with inflated vote counts. Add:

```sql
ALTER TABLE votes ADD CONSTRAINT votes_user_post_unique 
  UNIQUE (user_id, post_id) WHERE post_id IS NOT NULL;
ALTER TABLE votes ADD CONSTRAINT votes_user_comment_unique 
  UNIQUE (user_id, comment_id) WHERE comment_id IS NOT NULL;
```

---

**8. Supabase plan limits**

| Feature | Free | Pro ($25) | Team ($599) |
|---------|------|-----------|-------------|
| Concurrent DB connections | 60 pooled | 200 pooled | Configurable |
| Realtime connections | 200 | 500 | Custom |
| Edge function invocations | 500K/mo | 2M/mo | Custom |
| Storage | 1GB | 100GB | Custom |

At 500 users → Free tier is **borderline** (realtime connections).
At 1,000 users → **Pro is required** (you'll hit 200 concurrent connections during peak and 200 realtime connections).
At 5,000 users → **Team tier**, plus you need pgBouncer/Supavisor session pooling (Supabase Pro includes transaction pooling via Supavisor which helps, but you'll want to enable it explicitly).

---

### 🟡 Moderate (noticeable at 1K, painful at 5K)

**9. `profiles` is selected with `select("*")` in most places**

The chat users query, the profile query in `_layout.tsx`, and the `posts_summary_view` all select all columns. `profiles` has `bio` (potentially hundreds of characters per row). At 50 chats × full profile × 100 queries/minute, this is unnecessary bandwidth. Change to:

```ts
.select("id, username, avatar_url, is_verified, is_banned")
```

---

**10. `create-post` edge function has 3-8 second latency per post**

Two OpenAI calls (moderation API + GPT-4o-mini for curse check + optional image moderation) run sequentially. At 100 users trying to post simultaneously, Edge Function concurrency limits kick in and some calls will queue or time out. Users see a "spinner" for 5+ seconds.

The free OpenAI moderation API is fast (~200ms) and sufficient. The `gpt-4o-mini` curse check adds 1-3 seconds for every single post. Consider running these in `Promise.all` instead of sequentially, or caching the moderation result for identical content.

---

**11. `posts.view_count` is a write-heavy column**

Every post view likely increments `view_count` with an UPDATE. At 5K users scrolling through feeds with `removeClippedSubviews={true}`, that's potentially thousands of UPDATE queries per minute on the `posts` table. This creates write contention and slows down reads. Batch these with a debounce or use a separate `post_views` table.

---

## Recommended action sequence

**Before 500 users (do now):**
1. Add the critical DB indexes above (free, 5 minute SQL migration)
2. Add `UNIQUE` constraint on `votes`
3. Check if `posts_summary_view` is materialized — if not, create a materialized version with a `pg_cron` refresh

**Before 1,000 users:**
1. Upgrade to Supabase **Pro** ($25/month) — this also enables connection pooling
2. Fix push notification function: batch queries, use Expo batch push endpoint
3. Remove `refetchQueries` in `useGlobalUnreadCount`, rely on cache mutations

**Before 5,000 users:**
1. Upgrade to Supabase **Team** tier
2. Add `filter:` to realtime subscriptions
3. Move "hot" engagement sort to DB level
4. Optimize `select("*")` → `select("id, username, avatar_url, ...")` in profile queries

**Before 10,000 users:**
1. Move `vote_score` and `comment_count` to denormalized columns on `posts` (updated by triggers), removing the need for the summary view entirely
2. Add rate limiting to the `create-post` function (e.g. 5 posts/user/minute)
3. Consider a Redis/Upstash layer for hot feed caching