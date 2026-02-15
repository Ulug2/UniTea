# Deploy Moderation App on Vercel

Follow these steps to deploy the moderation dashboard to Vercel.

---

## 1. Push your code

Ensure your UniTee repo (including the `moderation/` folder) is pushed to GitHub, GitLab, or Bitbucket. Vercel will connect to this repo.

---

## 2. Create a Vercel project

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub/GitLab/Bitbucket).
2. Click **Add New…** → **Project**.
3. **Import** your UniTee repository.
4. If prompted to configure the project, continue to the next step.

---

## 3. Set the Root Directory

**Root Directory must be the `moderation` folder.**

1. In the project configuration, find **Root Directory**.
2. Click **Edit** next to it.
3. Enter: **`moderation`**
4. Confirm. Vercel will treat `moderation` as the project root (so it uses `moderation/package.json`, `moderation/next.config.ts`, and `moderation/src/`).

---

## 4. Build and output settings (defaults)

Leave these as-is unless you change the app later:

- **Framework Preset:** Next.js (auto-detected)
- **Build Command:** `npm run build` or `next build` (default)
- **Output Directory:** `.next` (default for Next.js)
- **Install Command:** `npm install` (default)

No need to set **Output Directory** explicitly for Next.js.

---

## 5. Environment variables

Add these in **Settings → Environment Variables** (or during the first deploy):

| Name | Value | Notes |
|------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | e.g. `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon (public) key | Same as in the main app / `.env` |

- Apply to **Production**, **Preview**, and **Development** if you use Vercel previews.
- Use the same values as in `moderation/.env.local` (or your main app’s Supabase config).

---

## 6. Deploy

1. Click **Deploy**.
2. Wait for the build to finish. Vercel runs `npm install` and `npm run build` inside the `moderation` root.
3. When it’s done, you get a URL like `unitee-moderation-xxx.vercel.app`.

---

## 7. Allow CORS from your Vercel URL (for Ban/Unban)

The moderation app calls the Supabase Edge Functions `ban-user` and `unban-user`. Those functions only allow requests from certain origins. Add your Vercel URL so the browser can call them:

1. Copy your Vercel URL (e.g. `https://unitee-moderation-xxx.vercel.app`).
2. In **Supabase Edge Functions** (`ban-user` and `unban-user`), add this origin to the `ALLOWED_ORIGINS` array in each function’s code, for example:

   ```ts
   const ALLOWED_ORIGINS = [
     "https://unitea.app",
     "https://www.unitea.app",
     "http://localhost:3000",
     "https://unitee-moderation-xxx.vercel.app",  // your Vercel URL
   ];
   ```

3. Redeploy the Edge Functions:

   ```bash
   supabase functions deploy ban-user
   supabase functions deploy unban-user
   ```

If you use a **custom domain** for the moderation app (e.g. `moderation.unitea.app`), add that domain to `ALLOWED_ORIGINS` as well and redeploy the functions.

---

## 8. Optional: Custom domain

1. In the Vercel project, go to **Settings → Domains**.
2. Add your domain (e.g. `moderation.unitea.app`).
3. Follow Vercel’s DNS instructions (CNAME or A record).
4. Add this domain to `ALLOWED_ORIGINS` in `ban-user` and `unban-user` and redeploy the functions (as in step 7).

---

## Summary

| Setting | Value |
|--------|--------|
| **Root Directory** | `moderation` |
| **Build Command** | (default) `npm run build` |
| **Output Directory** | (default) `.next` |
| **Env vars** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **After deploy** | Add Vercel (and custom) URL to Edge Functions CORS and redeploy `ban-user` and `unban-user` |
