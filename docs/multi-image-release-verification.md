# Multi-Image Release Verification Log

Date: 2026-03-19
Scope: multi-image create/upload, rendering, deletion, compatibility for legacy single-image posts

## 1) Consistency And Dead-Code Sweep

Result: PASS (for changed app files)

Checked changed files for compile/type issues and obvious dead paths:
- `src/app/(protected)/create-post.tsx`
- `src/hooks/useImagePipeline.ts`
- `src/hooks/useCreatePostFormState.ts`
- `src/hooks/useCreatePostMutation.ts`
- `src/components/PostListItem.tsx`
- `src/components/LostFoundListItem.tsx`
- `src/app/(protected)/(tabs)/index.tsx`
- `src/app/(protected)/(tabs)/lostfound.tsx`
- `src/app/(protected)/lostfoundpost/[id].tsx`
- `src/features/posts/components/PostHeaderCard.tsx`
- `src/types/posts.ts`
- `src/types/database.types.ts`

Notes:
- `PostListItem.tsx` had prior JSX/style corruption from iterative refactors and was repaired.
- Remaining diagnostics are only in Supabase Edge Function files due Deno import/type resolution in local TS tooling (not runtime blockers for deployed functions):
  - `supabase/functions/create-post/index.ts`

## 2) Automated Smoke Checks

Command:
- `npm test -- --runInBand src/__tests__/hooks/useCreatePostFormState.test.ts src/__tests__/hooks/useCreatePostMutation.test.ts src/__tests__/hooks/useImagePipeline.test.ts`

Result:
- PASS: 3/3 test suites
- PASS: 50/50 tests

Observed warning:
- Jest worker/process open-handle warning appears intermittently. It does not fail the run. Track separately as a test-hygiene item.

## 3) App-Level Smoke Checklist

Status legend:
- PASS = verified in code + tests
- MANUAL = requires device/emulator verification

Checklist:
- PASS: User can select multiple images in create post flow (limit enforced to 5).
- PASS: Selected images are processed and uploaded; mutation sends `image_url` (first) and `image_urls` (all).
- PASS: Legacy compatibility retained (`image_url` still populated and consumed as fallback).
- PASS: Feed/repost/lost-found renderers consume `image_urls` and fallback to `image_url`.
- PASS: Delete flow removes both single and multi-image storage paths.
- MANUAL: Create feed post with 0, 1, and 5 images on device.
- MANUAL: Repost with multiple images and verify fullscreen expansion behavior.
- MANUAL: Lost & found list/detail with multi-images, including tapping to expand.
- MANUAL: Verify horizontal gallery overflow scroll behavior and proportional image display on small screens.

## 4) Deployment Verification

Edge functions (`supabase functions list`):
- `create-post`: ACTIVE v10 (updated 2026-03-19 17:30:20 UTC)
- `delete-post`: ACTIVE v5 (updated 2026-03-19 17:30:21 UTC)

Migration (`supabase migration list`):
- Local migration present: `20260320090000_add_post_image_urls.sql`
- Remote column was blank at verification time; migration application to remote DB still needs explicit confirmation.

## 5) Rollback Plan

If app-level manual smoke fails:

1. Re-deploy previous known-good edge function versions:
- `supabase functions deploy create-post --project-ref <project_ref> --use-api`
- `supabase functions deploy delete-post --project-ref <project_ref> --use-api`

2. Revert app client to previous commit and redeploy OTA/binary as per release strategy.

3. Keep DB compatibility safe:
- Do not drop `image_url`.
- If needed, stop writing `image_urls` from client while retaining read fallback.

4. If DB migration must be rolled back (last resort, coordinated):
- Create a dedicated down migration after impact analysis (avoid destructive rollback while posts may already contain arrays).

## 6) Final Release Gate

Current gate:
- Code consistency: PASS
- Automated smoke: PASS
- Manual app smoke: PENDING
- Remote migration application: PENDING CONFIRMATION

Recommendation:
- Complete manual app smoke checklist and confirm migration is applied remotely before broad rollout.
