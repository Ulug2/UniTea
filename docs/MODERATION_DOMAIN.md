# Link the moderation site to your domain (unitea.app)

You have the moderation app on Vercel at **moderation-unitee.vercel.app**. You can expose it under your domain in two ways:

- **Option A (easiest):** **moderation.unitea.app** — subdomain, no code changes.
- **Option B:** **unitea.app/moderation** — path under the main domain; needs a small config change and rewrites.

---

## Option A: Subdomain — moderation.unitea.app (recommended)

No code changes. Add a domain in Vercel and one DNS record.

### 1. Add the domain in Vercel

1. Open [vercel.com](https://vercel.com) → your **moderation** project (the one that deploys to moderation-unitee.vercel.app).
2. Go to **Settings** → **Domains**.
3. Click **Add** and enter: **`moderation.unitea.app`**.
4. Vercel will show the DNS record you need (usually a **CNAME** to `cname.vercel-dns.com`).

### 2. Add the DNS record

1. Log in where you manage DNS for **unitea.app** (registrar or DNS provider).
2. Add a **CNAME** record:
   - **Name / Host:** `moderation` (so the full name is `moderation.unitea.app`).
   - **Value / Target:** what Vercel shows (e.g. `cname.vercel-dns.com`).
3. Save. Wait a few minutes (up to 48 hours in rare cases).

### 3. Check

Open **https://moderation.unitea.app**. You should see your moderation site. Vercel will provision HTTPS.

---

## Option B: Path — unitea.app/moderation

This serves the moderation app at **unitea.app/moderation** (and e.g. **unitea.app/moderation/dashboard**). You need:

1. The **main** project that serves **unitea.app** (the one with `.well-known` for universal links).
2. That project to **rewrite** `/moderation` and `/moderation/*` to your moderation deployment.
3. The **moderation** Next.js app to use **basePath: `/moderation`** so assets and links work under that path.

### Step 1: Set basePath in the moderation app

The moderation app already reads **basePath** from the env var **`NEXT_PUBLIC_BASE_PATH`** (see **moderation/next.config.ts**).

1. In **Vercel** → your **moderation** project → **Settings** → **Environment Variables**:
   - Add **`NEXT_PUBLIC_BASE_PATH`** = **`/moderation`** (for Production, and optionally Preview).
2. **Redeploy** the moderation project (trigger a new deployment so the build uses this env).
3. After deploy, the app will be served at **moderation-unitee.vercel.app/moderation** (and **unitea.app/moderation** once the rewrite is in place). Leave the env var unset if you only use the subdomain (Option A).

### Step 2: Rewrite /moderation on the main unitea.app project

The Vercel project that has **unitea.app** as a domain (the one with `public/.well-known/`) must proxy `/moderation` to the moderation deployment.

In **that project’s root** (the one that deploys to unitea.app, not the UniTee app repo root), add or edit **vercel.json**:

```json
{
  "rewrites": [
    {
      "source": "/moderation",
      "destination": "https://moderation-unitee.vercel.app/moderation"
    },
    {
      "source": "/moderation/:path*",
      "destination": "https://moderation-unitee.vercel.app/moderation/:path*"
    }
  ]
}
```

If that project already has a **vercel.json** (e.g. for headers), add the `rewrites` array to it and merge. Then deploy that project again.

### Step 3: Check

- **https://unitea.app/moderation** should show the moderation app.
- **https://unitea.app/moderation/dashboard** should work.
- **https://unitea.app/.well-known/apple-app-site-association** should still return the JSON (universal links still work).

### If you don’t have a “main” unitea.app project yet

If unitea.app is only the domain and you set up a minimal project just for `.well-known` (as in UNIVERSAL_LINKS_SETUP.md), that minimal project is the one that needs this **vercel.json** and the rewrites. So:

1. In that same repo (the one that deploys to unitea.app), add **vercel.json** with the rewrites above.
2. In the **moderation** repo (or `moderation/` in this repo), set **basePath: "/moderation"** and redeploy.
3. Deploy the unitea.app project again. Then **unitea.app/moderation** will proxy to the moderation app.

---

## Summary

| Goal                         | What to do |
|-----------------------------|------------|
| **moderation.unitea.app**   | Option A: add domain in Vercel for the moderation project, add CNAME `moderation` → Vercel. No code changes. |
| **unitea.app/moderation**   | Option B: set `basePath: "/moderation"` in moderation’s Next config, add rewrites in the unitea.app Vercel project’s vercel.json, redeploy both. |

Option A is simpler and is usually enough. Use Option B only if you specifically want the URL to be **unitea.app/moderation**.
