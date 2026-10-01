# Instagram post captures

`npm run capture:posts` turns the best anonymous campus posts into 1290×1612 (4:5)
PNGs using the read-only web post card preview (`/preview/post-card`).

## One-time setup (on your own machine)

1. `npm install` and `npx playwright install chromium`.
2. Create an untracked `.env.local` in the repo root (already gitignored):

   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   UNITEE_CAPTURE_NU_EMAIL=...      # a normal NU student account
   UNITEE_CAPTURE_NU_PASSWORD=...
   UNITEE_CAPTURE_SDU_EMAIL=...     # a normal SDU student account
   UNITEE_CAPTURE_SDU_PASSWORD=...
   ```

   RLS only lets an account read its own campus, so each campus needs its own
   account. Never use a service-role key.

## Each run

```
npx expo start --web                          # terminal 1
npm run capture:posts -- --campus nu --dry-run   # review the 5 picks
npm run capture:posts -- --campus nu
npm run capture:posts -- --campus sdu --dry-run
npm run capture:posts -- --campus sdu
```

Images land in `captures/<campus>/` (gitignored). Use `--pick id,id,...` to
choose posts yourself, `--count`/`--days` to widen the search.

## Picking rules

Anonymous, text-only campus feed posts (no community posts, reposts or images)
that fit the card without "read more", ranked by score, then comments, then
recency. Posts by authors the account has blocked are skipped.

**Always read each pick before publishing**: anonymous posts can still contain
names or details that identify someone.

## Used posts

`used-posts.json` lists every post already captured; runs skip them and append
new captures automatically. Add posts published by other means with a
`content_prefix` (as the first entry does) or their `post_id`.
