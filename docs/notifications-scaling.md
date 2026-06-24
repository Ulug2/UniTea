# Notification System — Scaling Reference

Current architecture: DB trigger → `notifications` INSERT → trigger fires `net.http_post` → edge function fetches all unsent rows → single Expo batch send.

---

## What was fixed (as of 2026-06-24)

| Issue | Fix |
|-------|-----|
| Race condition on upvote milestones | `post_vote_milestones (post_id, milestone)` PRIMARY KEY — atomic claim via `INSERT ON CONFLICT DO NOTHING` |
| `comment_reply` settings were fetched per-user inside the loop (N+1) | Batch `.in()` lookup before the loop, same as chat/vote |
| Sequential Expo API calls (one HTTP request per user) | Single batch call — all payloads sent as array, tickets processed from array response |
| Upvote milestone permanently lost when `notify_upvotes = false` | Milestone claimed in `post_vote_milestones` before checking preference; no re-fire if preference later enabled |
| Duplicate milestone notifications under concurrent votes | PRIMARY KEY dedup instead of message-text SELECT check |

---

## Issues remaining — fix at these thresholds

### < 1,000 DAU — do nothing
Current architecture handles this comfortably. The inefficiencies below exist but the absolute numbers are too small to matter.

---

### ~1,000–5,000 DAU

**Priority: medium**

#### 1. No push receipt handling / stale token cleanup
Expo's `/push/send` returns ticket IDs, not delivery confirmations. Actual delivery status requires polling `/push/getReceipts`. When a user uninstalls the app their Expo token goes stale, but it stays in your DB forever. You'll keep attempting pushes to dead tokens with no feedback.

**Fix:** Add a pg_cron job (daily) or a separate edge function that:
1. Collects `push_sent = true` notifications from the last 24h that have a ticket ID stored
2. Calls `https://exp.host/--/api/v2/push/getReceipts`
3. For any `status: "error"` with `details.error = "DeviceNotRegistered"` — nulls out the `push_token` in `notification_settings` for that user

Requires storing the Expo ticket ID on the notification row (add a `push_ticket_id` column).

#### 2. No notifications TTL
Old `is_read = false, push_sent = true` rows accumulate indefinitely. The edge function's `LIMIT 100` scans these on every invocation. If 100 stale notifications exist (inactive user who never opened the app), new notifications for other users wait until the next edge function call.

**Fix:** pg_cron job — delete (or archive) notifications older than 30 days:
```sql
DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days';
```
Run nightly.

---

### ~5,000–20,000 DAU

**Priority: high**

#### 3. Thundering herd — fire-on-every-INSERT
Every `notifications` INSERT fires `trigger_send_push_notification`, which calls the edge function, which re-scans all 100 unsent notifications. In a 1,000-message-per-minute chat burst: 1,000 edge function invocations each scanning the same 100-row queue. The mark-before-send guard prevents double-sends, but you're paying for ~1,000× the compute and DB load.

**Fix option A (simple):** Replace the DB trigger with a pg_cron schedule — run the edge function every 15–30 seconds instead of on every INSERT. Latency increases slightly (up to 30s delivery lag) but volume is completely controlled. No thundering herd.

```sql
-- Replace trigger_send_push_notification with a cron-only approach
SELECT cron.schedule('send-push-batch', '*/30 * * * * *', $$
  SELECT net.http_post(
    url := 'https://...supabase.co/functions/v1/send-push-notification',
    body := '{}'::jsonb,
    headers := jsonb_build_object('x-webhook-secret', ...)
  )
$$);
```

**Fix option B (better):** Use Supabase Realtime / pg_notify + a persistent worker that listens for INSERT events and debounces. Near-real-time delivery with controlled fan-out.

#### 4. LIMIT 100 means notifications can be missed in bursts
If more than 100 unsent notifications exist when the edge function runs, the oldest 100 are processed and the rest wait for the next invocation. At high volume, some users see delays or dropped pushes.

**Fix:** Either increase the limit (200–500, keeping within Expo batch limit of 100 per request — split into multiple Expo calls if needed), or move to the pg_cron approach from #3 which naturally processes in rolling windows.

#### 5. Vault secret read on every notification INSERT
`trigger_send_push_notification` does `SELECT FROM vault.decrypted_secrets` per INSERT. At 5k DAU with active chat: thousands of vault reads per hour for a value that never changes.

**Fix:** Cache the secret in a session-level GUC or read it once at function load time. Simplest: store the secret as a plain Supabase secret (env var in the edge function) rather than in Vault — the trigger already passes it as `x-webhook-secret` in the HTTP header, so the edge function reads it from `Deno.env`. The Vault read is in the *trigger* — change that to read a Supabase secret directly instead:
```sql
-- In trigger function body, replace vault read with:
SELECT current_setting('app.notification_webhook_secret', true) INTO webhook_secret;
-- Set via: ALTER DATABASE postgres SET app.notification_webhook_secret = '...';
```

---

### > 20,000 DAU

**Priority: architectural**

#### 6. Supabase Edge Functions aren't designed for sustained high-throughput fan-out
At this scale the entire trigger→edge-function pattern becomes a bottleneck. Edge functions have cold start latency and per-invocation overhead. The right solution is a dedicated async notification queue:

- **Option A:** Use Supabase's built-in `pg_net` + a persistent Deno worker (not a one-shot edge function)
- **Option B:** Move to a dedicated notification service (OneSignal, Knock, Novu) that handles delivery, retries, receipt tracking, and token management
- **Option C:** Use a message queue (SQS, Upstash QStash) as the transport between the DB trigger and the push sender

#### 7. `notifications` table becomes a hot table
Every chat message, vote, and comment writes to `notifications`. At 20k DAU with moderate engagement, this table gets dozens of writes per second. The AFTER INSERT trigger (calling Vault + net.http_post) runs synchronously inside the write transaction, adding latency to every chat message send.

**Fix:** Move notification creation out of the chat/vote/comment write transaction. Use AFTER INSERT DEFERRED triggers or an async queue (see #6).

#### 8. Badge counts computed from a view on every push
The unread chat badge count is computed by joining `user_chats_summary` per push batch. At scale, this view scan on every edge function invocation is expensive.

**Fix:** Maintain a `unread_count` column on `notification_settings` (or a separate table), updated by the notification trigger. Read it directly as a single column lookup rather than deriving it from a view.

---

## Summary table

| Scale | Fix |
|-------|-----|
| Now (< 1k DAU) | ✅ Done: batch Expo sends, N+1 fix, milestone dedup |
| 1k–5k DAU | Push receipt handling + stale token cleanup; notifications TTL |
| 5k–20k DAU | Replace INSERT trigger with pg_cron schedule; increase LIMIT; vault secret caching |
| > 20k DAU | Dedicated notification queue or third-party service; denormalize badge count |
