## Refactor cut plans (index)

These docs describe **how to cut large files into maintainable modules** (hooks/components/services), aligned with `docs/CLEAN_CODE_GUIDE.md`.

- `docs/CUT_PLAN_chat_detail.md`
  - Target: `src/app/(protected)/chat/[id].tsx`
- `docs/CUT_PLAN_post_detail.md`
  - Target: `src/app/(protected)/post/[id].tsx`
- `docs/CUT_PLAN_profile_screen.md`
  - Target: `src/app/(protected)/(tabs)/profile.tsx`
- `docs/CUT_PLAN_create_post.md`
  - Target: `src/app/(protected)/create-post.tsx`
- `docs/CUT_PLAN_auth_component.md`
  - Target: `src/components/Auth.tsx`

### Shared “first cuts” referenced by multiple plans
- Create `src/types/posts.ts` for a typed `posts_summary_view` row (replace `any`, remove duplicated `PostSummary` types).
- Create shared utilities:
  - `src/utils/links.ts` (open external links)
  - `src/utils/withTimeout.ts` or `useTimeoutRace` (central timeout/race)
  - `src/utils/retryOperation.ts` (shared retry helper using `unknown`, not `any`)

