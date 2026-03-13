### 2) How many concurrent users you can likely handle

Given your patterns and a typical Supabase **Pro (small)** setup (feed-heavy usage, 100–1,000 concurrent users target):

- **Per-active-user load recap (ballpark)**:
  - **Reads**: ~1–4 queries per minute (feed pages, occasional comments, chat list/unread, some profile data).
  - **Writes**: usually ≤1 write/min for an engaged user (posts, comments, votes, messages).
  - **Realtime**: 3–4 channels per active user; modest event rate except in hot chats.

Modern Postgres-backed systems like Supabase Pro (small) can generally sustain **hundreds of simple queries per second** and Realtime can handle **thousands of connections** with moderate event rates.

Translating your app’s pattern:

- **100 concurrent active users**
  - Roughly:
    - Reads: 100–400 queries/min ≈ 2–7 QPS (queries per second).
    - Writes: up to ~100 writes/min ≈ 1–2 WPS.
    - Realtime: ~300–400 open channels.
  - **This is trivial** for Supabase Pro. Your current design and caching are more than sufficient.

- **500 concurrent active users**
  - Reads: 500–2,000 queries/min ≈ 8–35 QPS.
  - Writes: ~500 writes/min ≈ 8–9 WPS.
  - Realtime: ~1,500–2,000 open channels.
  - This is still **well within what a Pro (small) project can usually handle**, assuming:
    - Reasonable indexing on your key columns.
    - No pathological hot spots (e.g., everyone hammering one huge comment thread at once).
  - You should be comfortably fine at this level with your current architecture.

- **1,000 concurrent active users**
  - Reads: 1,000–4,000 queries/min ≈ 17–67 QPS.
  - Writes: ~1,000 writes/min ≈ 17 WPS.
  - Realtime: ~3,000–4,000 channels.
  - At this level, you’re entering a **high but still realistic range** for Pro (small), where:
    - With **proper indexes and reasonably sized rows**, it can typically cope, but you may start to notice:
      - Slower comment loads for huge threads.
      - Occasional spikes in latency during campus-wide high usage moments (e.g., events where many users open the same post or chat).
  - This is a reasonable **upper-stress range** for your current implementation on Pro (small).

So, under feed-heavy but not write-crazy usage:

- **Comfortable range today**: about **100–500 concurrent active users**.
- **Upper-stress but still plausible range** (with good indexes & tuning): around **500–1,000 concurrent active users**.
- Beyond that, you’d likely want:
  - Either **Supabase scaling** (larger Pro/Business resources, read replicas).
  - Or targeted optimizations (especially on comments & aggregates).

These numbers are approximate, but they are consistent with your efficient client design and typical Pro-tier capabilities.

---

### 3) Likely bottlenecks as you grow

As you move toward the upper end of your target (hundreds to ~1,000 concurrent users), the **first pain points** are likely:

- **Comment-heavy posts**
  - Every comments view does 3 set-based queries over all comments for that post, plus profiles and votes.
  - For posts with **very large comment counts (hundreds to thousands)**:
    - Response size and query time grow linearly with comment count.
    - Many users opening that same post concurrently concentrates load on a small set of rows.
  - Symptoms:
    - Comments loading slowly or intermittently failing.
    - Database CPU / I/O spikes when hot posts are active.

- **Per-user total votes aggregation**
  - Current implementation scans all of a user’s rows in `posts_summary_view` and sums `vote_score` client-side.
  - For heavy posters, this becomes a larger scan and heavier single query.
  - Symptoms:
    - Slow profile stats loading for extremely active users.
    - Occasional timeouts during peak when many such queries run concurrently.

- **Realtime connection and event load**
  - Each user adds 3–4 channels; Realtime infrastructure can handle many, but:
    - If you have **lots of users in very active chats**, event rate per channel can be high (many messages per second).
    - Feed channel `INSERT` events fan out to all clients listening to `posts` inserts.
  - Symptoms:
    - Delayed or dropped Realtime updates.
    - Realtime service warnings in Supabase metrics/logs.

- **Hot paths on views**
  - `posts_summary_view` and `user_chats_summary` are central:
    - Feeds, lost & found, user posts, and some aggregates go through `posts_summary_view`.
    - Chat list and unread counts rely on `user_chats_summary`.
  - If underlying tables or view definitions are not well-indexed on:
    - `created_at`, `hot_score`, `user_id`, `is_banned` (for posts).
    - `participant_1_id`, `participant_2_id`, `last_message_at` (for chats).
  - Symptoms:
    - Gradually degrading query latency as tables grow.
    - Planner choosing sequential scans where indexes should be used.

---

### 4) How to validate this in practice (minimal, concrete steps)

To turn these estimates into confidence:

- **Metrics & logging in Supabase**
  - In the Supabase dashboard for this project, enable and watch:
    - **Postgres metrics**:
      - CPU, connections, transaction rate.
      - Slow query logs (check for `comments`, `posts_summary_view`, `user_chats_summary`, `votes`, `profiles`).
    - **API request metrics**:
      - Error rates, P95/P99 latency per table/view.
    - **Realtime metrics**:
      - Connection count, events per second.
  - Focus on periods when you have the most real users online (or when you simulate load).

- **Quick synthetic load test (no backend changes needed)**
  - Create a small script (Node/TS) using the **Supabase JS client** with your **service role key** in a secure environment (not shipped to the app) to mimic:
    - N “virtual users”:
      - Each user:
        - Loads 2–4 feed pages (calls to `posts_summary_view`).
        - Opens 1 comments view on a post (triggering the 3 queries).
        - Optionally sends a chat message.
      - Stagger actions over time (e.g., randomly over 5–10 minutes).
  - Gradually increase N until:
    - You reach a combined query rate approximating 500–1,000 concurrent users’ behavior.
    - You observe when latency or error rates start to increase.
  - This will give you a **project-specific** safe range and confirm whether your real bottleneck is CPU, row size, or Realtime.

- **Index verification**
  - In Supabase’s SQL editor, confirm indexes exist for:
    - `comments(post_id, is_deleted)`.
    - `votes(comment_id)`.
    - Underlying `posts` table columns used in `posts_summary_view` filters: `created_at`, `hot_score`, `is_banned`, `user_id`.
    - Underlying chat tables: `participant_1_id`, `participant_2_id`, `last_message_at`.
  - If any are missing, adding them usually yields a **large jump in capacity** without touching the app code.

- **Targeted optimizations to unlock more headroom**
  - When you approach the higher end of your range (~1,000 concurrent users), consider:
    - **Paginating comments** and/or lazily loading replies for very large threads.
    - Moving the per-user total votes to a **server-side aggregate** (view or RPC that returns a single row).
    - Introducing a **lighter-weight unread-count view** that only returns totals, not full chat summaries.

---

### Final answer (condensed)

- **With your current architecture and Supabase Pro (small)**, the app is structured efficiently enough that:
  - You should be **very safe up to ~100–500 concurrent active users**.
  - You can likely support **up to around 1,000 concurrent active users** before you start to see noticeable stress (especially on big comment threads and some aggregates), assuming decent indexing.
- The main stressors as you scale are **large comment threads**, **per-user aggregates over many posts**, and **Realtime load in very hot chats**.
- To gain high confidence, use Supabase metrics plus a small synthetic load script that mimics your feed + comments + chat usage, and ensure key indexes exist on the tables/views highlighted above.