# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Mobile app (root)
```bash
npm start              # Expo dev server (Expo Go / dev client)
npm run ios            # Native iOS build
npm run android        # Native Android build
npm test               # Run all Jest tests
npm run test:watch     # Jest in watch mode
npm test -- --testPathPattern=useVote   # Run a single test file
npm run types          # Regenerate DB types from Supabase (requires CLI auth)
```

### Moderation dashboard (`moderation/`)
```bash
cd moderation && npm run dev   # Next.js dev server
cd moderation && npm run build
```

### Edge Functions (Supabase CLI)
```bash
supabase functions deploy <function-name>
supabase functions serve <function-name>   # local testing
```

## Architecture

### Mobile app (`src/`)

**Routing**: Expo Router with file-based routes under `src/app/`. Two layout groups: `(auth)` for unauthenticated screens and `(protected)` for post-login screens (tabs, chat, post detail, etc.).

**Server state**: TanStack Query v5. Every feature area owns a `data/queryKeys.ts` file that defines typed key factories — use these for all reads, writes, optimistic updates, and invalidations so cache entries always align. Feed uses `useInfiniteQuery` with cursor-based pagination via `posts_summary_view`.

**Data layer**: All Supabase calls go through `src/lib/supabase.ts` which exports a typed client (`createClient<Database>`). DB types live in `src/types/database.types.ts` (generated — don't edit by hand). Shared view types that aren't in the generated schema live in `src/types/posts.ts` (`PostsSummaryViewRow`).

**Auth**: `AuthContext` (`src/context/AuthContext.tsx`) wraps the Supabase session and exposes `session`, `loading`, `cachedProfile`, and `persistProfile`. Profile data survives cold starts via AsyncStorage. Use `useAuth()` throughout; never call `supabase.auth` directly in components.

**Feature organization**: `src/features/<domain>/` — each domain has `components/`, `hooks/`, and optionally `data/`, `utils/`, `types/`. Global reusable hooks are in `src/hooks/`; global components in `src/components/`.

**Rate limiting**: Two-layer defense. Edge functions call `checkRateLimit()` (`supabase/functions/_shared/rateLimit.ts`) with the service role key. Client-side mutations call `checkClientRateLimit()` (`src/utils/clientRateLimit.ts`) which invokes the `check_rate_limit` Postgres RPC. Both fail open on infrastructure errors — never block real users due to rate-limit infrastructure problems.

**Logging**: Always use `src/utils/logger.ts` (`logger.info/warn/error`). In `__DEV__` it writes to console; in production it routes to Sentry. `logActivity()` (`src/utils/activityLogger.ts`) is fire-and-forget analytics — never await it, and it's silently skipped in `__DEV__`.

### Backend (Supabase)

**Main post view**: `posts_summary_view` is the denormalized source for feed, profile, lost & found, and detail screens. It includes vote scores, comment counts, repost info, and community fields. Query it via `supabase.from("posts_summary_view")`.

**Comments**: Stored flat in the DB. `buildCommentTree()` (`src/features/comments/utils/tree.ts`) converts flat `CommentVM[]` to nested `CommentNode[]`, applying block filtering. Anonymous commenters get a `post_specific_anon_id` (stable per-post number like "User 1", "User 2").

**Anonymity**: Anonymity is a product feature, not an absence of identity. Server-side RLS still applies. Block scope differentiates `anonymous_only` vs `profile_only`.

**Migrations**: `supabase/migrations/` — sequential SQL files. Always add new schema changes as new migration files, never edit existing ones.

**Edge Functions** (`supabase/functions/`): Deno runtime. Each function imports from `https://deno.land/` and `https://esm.sh/`. Shared utilities in `_shared/`. Functions needing admin access use `SUPABASE_SERVICE_ROLE_KEY`. AI moderation (`create-post`, `create-comment`) calls OpenAI via `OPENAI_API_KEY`. Three functions bypass JWT verification (configured in `supabase/config.toml`): `check-email-exists`, `send-push-notification`, `profile-count`.

### Moderation dashboard (`moderation/`)

Next.js 15 app. Requires `profiles.is_admin = true` in Supabase. Reads from the same Supabase project. SQL setup scripts in `sql/` must be run before first use. No TypeScript type generation — types are written by hand or inferred.

## Testing

Tests use `jest-expo` preset. The shared Supabase mock is at `src/__mocks__/supabase.ts` — individual tests override specific methods with `mockResolvedValueOnce` / `mockImplementationOnce`. Coverage collection is scoped to a specific file list in `package.json`; don't expect 100% project coverage.

## Key conventions

- Cast to `(supabase as any)` when querying tables/RPCs not yet reflected in the generated types (e.g., after adding a migration before running `npm run types`).
- All RLS policies on write tables must use `auth.uid()` — never `USING(true)` on insert/update policies. Always pair `SECURITY DEFINER` functions with `REVOKE` + explicit `search_path`.
- `__DEV__` is `false` in EAS production builds — use it to gate dev-only logging and mock data.
- Push notifications flow: DB trigger → `notifications` table insert → `send-push-notification` Edge Function → Expo Push API.

## Global engineering requirements
- UniTee is a production mobile application for both iOS and Android. Any solution must work correctly on both platforms unless a platform-specific difference is explicitly required.
- Favor solutions that are clean, efficient, scalable, secure, maintainable, and production-ready.
- Avoid duplicate logic, unnecessary complexity, technical debt, or temporary workarounds.
- Reuse existing architecture where appropriate and explain any new architectural decisions.
- Verify behavior through testing whenever possible rather than reasoning alone. Report any additional bugs discovered during investigation before implementing fixes.

## Required investigation and implementation process

Before modifying code, investigate first. Trace the full lifecycle from user action through state, API/database, cache, realtime, and rendering; verify the bug still exists; identify its exact root cause; and review recent related changes for regressions. Do not mistake a symptom for the source-of-truth issue.

Provide an investigation report before implementation that covers: current and expected behavior, reproducible steps, root cause and why existing code permits it, affected files and systems, impact/scope, related flows, recommended smallest correct fix, and regression risks. Trace all entry points and consumers, search for duplicate implementations, and decide whether the issue is isolated or architectural.

Preserve unrelated behavior. Prefer a small correct source-of-truth fix over workarounds, broad refactors, duplicated state, caches, listeners, or sources of truth. Follow existing project patterns and do not blindly restore old code without understanding why it was introduced and whether it remains valid.

Assess relevant variants: iOS and Android; simulator versus real device; rapid/repeated actions; multiple users/devices; sender/receiver and owner/non-owner roles; anonymous/non-anonymous; and blocked/unblocked states. For a feature area, audit the connected flows (for example feeds include campus/community feeds, search, caching, persistence, and mutations; chat includes anonymous/normal chat, realtime, unread counts, and notifications).

Before a final implementation decision, surface any genuine product decision that needs confirmation rather than assuming it.

After implementation, report every file changed and why; the root cause and why the change fixes it; tests/type checks/manual verification and results; and a regression checklist covering what could break, what was verified, and what intentionally remains unchanged. Testing must include normal and edge flows, rapid actions, relevant multi-device behavior, platform differences, and related-feature regressions.

Engineering priorities: correctness over quick patches; clear query/cache/state ownership; targeted invalidations and renders; no unnecessary refetches or flicker; retain useful optimistic updates; and for realtime features, account for optimistic state, server confirmation, realtime events, cache synchronization, and multi-device behavior. The end goal is predictable, isolated, scalable, cross-device-consistent behavior that resists regressions.

## After every coding session Claude:
- removes dead code,
- removes obsolete comments,
- simplifies duplicated logic,
- verifies there are no stale migrations or references,
- looks for performance improvements,
- checks for memory leaks and unnecessary re-renders,
- ensures everything works cleanly on both iOS and Android.
