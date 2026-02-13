## Cut Plan: `src/app/(protected)/(tabs)/profile.tsx` (Profile screen)

### Why this file needs a cut
- **SRP violation**: profile header/UI, theme toggle, tabs, posts list, bookmarks list, blocked users management, avatar upload, password update, account deletion, push notification registration, and multiple modals are all in one file.
- **Duplicated domain type**: `PostSummary` is duplicated across multiple screens.
- **TypeScript rule violation**: `theme: any` in `ProfilePostItemProps`.
- **Magic strings**: Notion URLs embedded inline.

### Goals (definition of done)
- Profile screen is a **thin composition layer**.
- Shared types (`PostSummary` / view rows) are centralized.
- No `any` in props or new hooks.
- Each action (upload avatar, update profile, update password, delete account, unblock all) lives in a **dedicated hook/service** with consistent error handling.

---

## Current responsibilities → extraction targets

### A) Shared types (`PostSummary`) + post item rendering
- **Current**: defines `PostSummary` locally and uses a memoized `ProfilePostItem` component with `theme: any`.
- **Extract**:
  - Move `PostSummary` to `src/types/posts.ts` as `PostsSummaryViewRow` (shared with feed/lostfound/post detail).
  - Extract `ProfilePostItem` to `src/features/profile/components/ProfilePostItem.tsx`.
  - Replace `theme: any` with a real `Theme` type exported from `ThemeContext` (or inferred).

### B) External links (Terms/Privacy)
- **Current**: `openExternalLink` plus inline Notion URLs.
- **Extract**:
  - `src/config/links.ts` exporting `TERMS_URL`, `PRIVACY_URL`.
  - `openExternalLink(url)` can be a shared util `src/utils/links.ts`.

### C) Push notification registration
- **Current**: calls `usePushNotifications()` directly inside profile screen.
- **Extract**:
  - Decide policy: register token once at app boot (recommended) vs per-profile view.
  - If “once”: move to `src/app/_layout.tsx` (or root auth gate) and remove from profile.

### D) Blocked users
- **Current**: inline `useQuery(["blocks", session?.user?.id])` + unblock all mutation.
- **Extract**:
  - Reuse your existing `useBlocks()` hook (already used in other screens).
  - Create `useUnblockAll()` hook in `src/features/blocks/hooks/`.

### E) Data fetching: profile + posts + bookmarks + votes/comments aggregates
- **Current**: multiple queries and in-file transformations.
- **Extract**:
  - `useMyProfile(userId)`
  - `useMyPosts({ userId, tab })` (all/anonymous/bookmarked)
  - `useMyPostStats(postIds)` if needed (or ensure your view returns `vote_score`, `comment_count` so the UI is simple).
  - Prefer **one “view model” query** (like `posts_summary_view`) rather than N+1 client-side aggregation.

### F) Mutations: update profile, update password, delete account, upload avatar
- **Current**: several `useMutation` blocks + repeated Alert/error normalization.
- **Extract**:
  - `useUpdateProfile()`
  - `useUpdatePassword()`
  - `useDeleteAccount()`
  - `useAvatarUpload()`:
    - pick image (ImagePicker)
    - upload (uploadImage util)
    - update profile avatar url/path
  - Each hook should:
    - accept typed input
    - return `mutateAsync` + `isPending`
    - expose a single `getUserFacingError(err)` helper for consistent alerts.

### G) UI composition + modals
- **Current**: large render function with multiple modals: settings, manage account, avatar preview, notifications.
- **Extract components**:
  - `ProfileHeader`
  - `ProfileTabs`
  - `ProfilePostsList`
  - `ProfileSettingsModal`
  - `AvatarPreviewModal`
  - Keep `ManageAccountModal` and `NotificationSettingsModal` as-is but trigger them from a small controller hook:
    - `useProfileModals()`

---

## Proposed target structure

```text
src/features/profile/
  components/
    ProfileHeader.tsx
    ProfileTabs.tsx
    ProfilePostsList.tsx
    ProfilePostItem.tsx
    AvatarPreviewModal.tsx
    ProfileSettingsModal.tsx
  hooks/
    useMyProfile.ts
    useMyPosts.ts
    useAvatarUpload.ts
    useUpdateProfile.ts
    useUpdatePassword.ts
    useDeleteAccount.ts
    useProfileModals.ts
src/config/links.ts
src/types/posts.ts
```

---

## Cut sequence (safe + incremental)

### Cut 1: Centralize shared constants/types
- Create `src/types/posts.ts` and replace local `PostSummary` with import.
- Create `src/config/links.ts` and replace inline Notion URLs with constants.
- Export a `Theme` type from `ThemeContext` and replace `theme: any`.

### Cut 2: Extract `ProfilePostItem`
- Move to `src/features/profile/components/ProfilePostItem.tsx`.
- Keep memoization but ensure comparator matches actual props.

### Cut 3: Extract profile data hooks
- Create `useMyProfile(userId)` and `useMyPosts({ userId, tab })`.
- Keep the screen calling them; move queryFns out of UI.

### Cut 4: Extract mutations into hooks
- `useAvatarUpload`, `useUpdateProfile`, `useUpdatePassword`, `useDeleteAccount`.
- Screen becomes “call mutate + show modal”.

### Cut 5: Split UI sections
- `ProfileHeader`, `ProfileTabs`, `ProfilePostsList`, `ProfileSettingsModal`.
- Screen becomes <200–250 lines.

---

## Risks / test checklist
- Avatar upload: permissions, cancellation, upload failure, and UI state reset.
- Bookmarked tab: ensure query keys and invalidations keep list fresh.
- Theme toggle: ensure derived styles update without breaking memoization.
- Delete account: ensure all cleanup flows are contained and UI doesn’t crash mid-navigation.

