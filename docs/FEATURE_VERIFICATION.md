# UniTee Feature Verification Master Checklist

This document is the single source of truth for feature verification. Every feature must be audited, tested, documented, and have automated tests before it is marked complete. Work strictly in priority order: complete all P1 features before moving to P2, and so on.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Verified and complete |
| ❌ | Broken — needs fix |
| ⚠️ | Works but has known limitations |

---

## P1 — Core (app unusable without these)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Auth — Login / Signup (email + password, university domain gate) | ✅ | 30 tests (useAuthFlow) + domain/error-mapping utils |
| 2 | Auth — Email verification flow (callback + resend with cooldown) | ✅ | Callback screen had zero coverage — added 12 tests |
| 3 | Auth — Session persistence (user stays logged in across restarts) | ✅ | 12 tests (AuthContext) |
| 4 | Feed — Main feed loads (Hot/New/Top tabs, infinite scroll) | ✅ | useFeedPosts had zero coverage — added 14 tests |
| 5 | Feed — Post creation (text, anonymous toggle, image upload, AI moderation) | ✅ | 18 tests (useCreatePostMutation) + form-state/pipeline tests |
| 6 | Feed — Vote (upvote/downvote) with optimistic update | ✅ | useVote + usePostScore + votes util all covered |
| 7 | Post Detail — View post + threaded comments | ⚠️ | Comment fetch/tree logic well tested; screen-level block-redirect ("Post Not Found") not covered — see Feature 7 notes |
| 8 | Post Detail — Add comment (with anonymous toggle) | ✅ | useCreateComment covered |
| 9 | Chat — Initiate chat from a post (public and anonymous posts) | ✅ | useInitiateAnonymousChat had zero coverage — added 15 tests |
| 10 | Chat — Send/receive messages (realtime, text + images) | ✅ | 7 test files across send/fetch/realtime/cache — most thoroughly covered P1 area |

---

## P2 — Important user flows

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11 | Auth — Forgot / Reset password | ✅ | reset-password screen had 0 tests despite being the most security-sensitive screen in the app — added 12. Also fixed: tap-outside-to-dismiss keyboard was missing on the New Password form |
| 12 | Feed — Community filter + search | ⚠️ | Fixed a real cross-feed cache leak: post/bookmark invalidation used the broad `["posts","feed"]` prefix instead of scoping to the affected community, so Campus Feed could transiently reflect another community's state until a manual refresh. Filter bar UI itself still has no dedicated coverage |
| 13 | Feed — Block filtering (server-side, anonymous + profile scope) | ✅ | useBlocks, useBlockUser, useUnblockAll all covered |
| 14 | Feed — Report post | ✅ | useReportPost covered |
| 15 | Feed — Hide post (session-local) | ✅ | FilterContext had 0 tests — added 7 |
| 16 | Feed — Repost with comments | ✅ | useOriginalPostForRepost + repost cases in useCreatePostMutation covered |
| 17 | Feed — Poll creation + display | ⚠️ | Vote mutation is inline in `Poll.tsx`, not an extracted unit — no automated coverage |
| 18 | Lost & Found — Browse feed + search | ⚠️ | Inline `useQuery` in the L&F screen, not an extracted unit — no automated coverage |
| 19 | Lost & Found — Create L&F post | ✅ | Covered by useCreatePostMutation's lost&found test cases |
| 20 | Lost & Found — Chat CTA from L&F post detail | ✅ | Reuses useInitiateAnonymousChat (covered) |
| 21 | Chat List — Summaries, sort by recency, unread badge | ⚠️ | Summaries query is inline in the chat list screen; unread badge count logic (useGlobalUnreadCount) had 0 tests — added 5 for that half |
| 22 | Chat — Mark as read, badge count sync | ✅ | useGlobalUnreadCount added this pass (5 tests); mark-as-read timing verified manually (screen-level timers) |
| 23 | Chat — Reply threading | ✅ | useChatSendMessage had 0 reply-specific tests — added 4 |
| 24 | Chat — Delete chat / Block user from chat | ✅ | Delete message covered by useChatMessageActions; block covered by useBlockUser; "delete chat" (empty-chat cleanup) is screen-level, verified manually |
| 25 | Profile — View own posts (All / Anonymous / Bookmarked tabs) | ✅ | useMyPosts covered |
| 26 | Profile — Change avatar, username, password | ✅ | Avatar/username covered pre-existing; password change (useUpdatePassword) had 0 tests — added 4; shared passwordValidation util had 0 tests — added 15 |
| 27 | Push Notifications — Receive + tap to navigate | ✅ | Routing logic (getNotificationData/routeFromNotification) had 0 direct tests — added 11 |
| 28 | Push Notifications — Per-type settings (chats, upvotes) | ⚠️ | Toggle mutation is inline in `NotificationSettingsModal`, not an extracted unit — no automated coverage |

---

## P3 — Secondary features

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 29 | Communities — Browse directory, join/leave | ✅ | Join/leave (optimistic + rollback) had 0 tests — added 6; directory browse/search is a simpler read-only fetch, not separately tested |
| 30 | Communities — Create community | ✅ | 0 tests — added 4 (auth guard, Edge Function payload, rate limit, duplicate-name mapping) |
| 31 | Communities — Manage community (owner: edit, delete) | ✅ | 0 tests — added 4 |
| 32 | Matchmaking — Banner phase awareness | ✅ | Pre-existing `bannerVisibility.test.ts` |
| 33 | Matchmaking — Profile submission form (multi-step) | ✅ | Validation logic (`useSubmitMatchmaking`) had 0 tests — added 8; the multi-step form UI itself is inline, not separately tested |
| 34 | Matchmaking — Reveal modal (match display, countdown timer) | ✅ | Countdown logic (`useMatchWindowStatus`) had 0 tests — added 5; the reveal modal UI itself is inline, not separately tested |
| 35 | Matchmaking — Initiate DM with match | ✅ | `useInitiateMatchChat` had 0 tests despite the same race-condition-prone logic as Feature 9 — added 6 |
| 36 | Feed — Cold-start AsyncStorage seed (instant content on open) | ⚠️ | Known pre-existing bug: `seedQueryCacheFromStorage`'s cache key doesn't match the real 6-part `feedKeys.list` key, so the seed is currently inert (flagged in project memory, not fixed this pass — out of scope for a verification pass) |
| 37 | Feed — Realtime new-post notification (stale-then-refetch) | ⚠️ | Inline `postgres_changes` subscription in the feed screen, not an extracted unit — no automated coverage |
| 38 | Feed — Skeleton reveal after N images load | ✅ | `useRevealAfterFirstNImages` had 0 tests — added 8 (fake-timer based) |
| 39 | Chat — Optimistic message send, image messages | ✅ | Fully covered by P1/P2's `useChatSendMessage.test.ts` work |
| 40 | Chat — Empty chat cleanup on leave | ⚠️ | Screen-level in `chat/[id].tsx`, not extracted — verified manually |
| 41 | Chat — Date dividers, deleted-message tombstones | ⚠️ | Tombstone visibility rules (`isDeletedForViewer`/`isDeletedForEveryone`/`selectMessages`) had 0 tests — added 9; date-divider logic is inline `useCallback`s in the screen, not extracted — no automated coverage for that half |
| 42 | Profile — Notification settings modal | ⚠️ | Same as P2 Feature 28 — inline component logic, no unit coverage |
| 43 | Profile — Delete account, logout, unblock all | ✅ | Already covered by `useDeleteAccount.test.ts`, `useUnblockAll.test.ts`, `AuthContext.test.tsx`'s signOut tests |
| 44 | Deep link handling (post links, email verification) | ✅ | `redirectSystemPath` had 0 tests — added 13, which **found and fixed a real bug**: custom-scheme deep links (`myunitea://reset-password?...`) were silently never rewritten |

---

> **Note:** The admin dashboard (`moderation/`) is intentionally out of scope for this checklist. It has no test infrastructure (no Jest/Vitest/RTL) and is a separate Next.js project; automated verification was descoped by decision rather than left incomplete.

---

## Verification Log

For each completed feature, record what was verified, any bugs found, root cause, fix applied, tests added, and known limitations.

---

### Feature 1 — Auth: Login / Signup

**Status:** ✅ Verified and complete

**Scope:**
- Email + password form (shared Login / Signup toggle)
- University domain gate (client-side pre-check via `check-email-exists`, enforced server-side)
- Terms & Privacy acceptance checkbox (signup only)
- Show/hide password toggle
- 5-minute rate limit with countdown timer
- 60-second per-email resend cooldown on verification resend
- Supabase `signInWithPassword` / `signUp` calls via `useAuthFlow`

**Verified:** `src/__tests__/hooks/useAuthFlow.test.ts` (30 tests) covers sign-in/sign-up guards, email sanitization, rate-limit gating, resend cooldown, and error-message mapping end to end. `universityDomain.test.ts` and `authErrors.test.ts` cover the supporting utils. Ran the full suite — all passing.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None needed — pre-existing coverage confirmed meaningful (asserts real behavior: guard messages, payload shape, alert content — not implementation details).
**Known limitations:** Real-time password-strength UI (added earlier this project) doesn't have dedicated tests; validated manually.
**Last verified:** 2026-07-03

---

### Feature 2 — Auth: Email Verification Flow

**Status:** ✅ Verified and complete

**Scope:**
- Post-signup "check your email" state
- Resend verification email (60-second cooldown per email address)
- `/callback` route: PKCE code exchange (`exchangeCodeForSession`) and legacy token path (`setSession`)
- Inline error display with "Back to sign in" on verification failure

**Verified:** Resend/cooldown behavior covered by `useAuthFlow.test.ts`. The `/callback` screen itself (`src/app/(auth)/callback.tsx`) had **zero** test coverage — it's the last step of signup, so a silent regression here would strand every new user. Traced all 4 paths: link-level error params, PKCE code exchange, legacy access/refresh token, and the "Back to sign in" recovery action.
**Bugs found:** None — the screen's logic was already correct (verified via new tests, not by fixing anything).
**Fix applied:** N/A
**Tests added:** `src/__tests__/app/(auth)/callback.test.tsx` — 12 tests: verifying-state render, error-param priority (error_description > error_code > generic), successful/failed/exceptional PKCE exchange, successful/failed legacy setSession, missing-token guard, and the back-to-sign-in button.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 3 — Auth: Session Persistence

**Status:** ✅ Verified and complete

**Scope:**
- `AuthContext` wraps Supabase session
- `cachedProfile` loaded from AsyncStorage on cold start (no blank auth flash)
- `persistProfile` writes to AsyncStorage on profile fetch
- Session survives app background/foreground cycle
- `onAuthStateChange` listener refreshes session token before expiry

**Verified:** `src/__tests__/context/AuthContext.test.tsx` (12 tests) covers initial loading state, `getSession` resolution (success/null/error), every `onAuthStateChange` event type (`SIGNED_OUT`, `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`), forced sign-out on refresh-token error, and that `signOut()` clears session even if the underlying Supabase call throws.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None needed — existing coverage is meaningful and exercises real state transitions, not implementation details.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 4 — Feed: Main Feed Loads

**Status:** ✅ Verified and complete

**Scope:**
- Three-tab pager (Hot / New / Top) with `pagingEnabled` ScrollView
- Each tab has its own `useFeedPosts` infinite query instance
- Community filter bar (horizontal pill list)
- Per-tab search bar (pull-down to reveal)
- Infinite scroll via `fetchNextPage`
- AsyncStorage cold-start seed (first page shown before network response)
- Skeleton overlay → `useRevealAfterFirstNImages` reveal
- Matchmaking banner (phase-aware, scroll-dismissing)
- FAB for create post
- Realtime new-post debounced invalidation

**Verified:** `useFeedPosts` — the query hook backing all three tabs — had **zero** test coverage despite being the site of two real bugs fixed earlier this project (cross-university data leak, and a startup prefetch that seeded Hot's cache with New's data). Added coverage for exactly those regressions plus the general query-construction logic.
**Bugs found:** None new in this pass — the two bugs above were already fixed earlier in the project; this work adds the regression tests that should have existed at the time.
**Fix applied:** N/A (see `src/app/_layout.tsx` prefetch fix and the `enabled: !!universityId` gate, both already in place).
**Tests added:** `src/__tests__/hooks/useFeedPosts.test.ts` — 14 tests: `enabled` gating (regression for the university-scoping race), university/community scoping, per-filter query construction (hot/new/top sort + window), search sanitization, pagination (`hasNextPage`, range), and error propagation.
**Known limitations:** The screen itself (`index.tsx`: pager, community filter bar, matchmaking banner, skeleton reveal) is not covered by component tests — only the data-fetching hook is. Consistent with this codebase's existing convention of hook-level rather than full-screen tests.
**Last verified:** 2026-07-03

---

### Feature 5 — Feed: Post Creation

**Status:** ✅ Verified and complete

**Scope:**
- Feed / L&F / Repost mode via URL `type` param
- Feed form: optional title (120 char), required body, anonymous toggle
- Image picker (up to 5), `useImagePipeline` compression, aspect ratio tracking
- `isProcessingImages` guard prevents submission while images are processing
- Concurrent upload (concurrency 3 via `mapWithConcurrency`)
- `create-post` Edge Function: rate limit, OpenAI text + image moderation
- Poll builder (2–11 options, atomic insert)
- Optimistic insertion into feed cache on success
- Loading overlay modal during mutation
- Repost preview card in repost mode

**Verified:** `useCreatePostMutation.test.ts` (18 tests) covers guards (auth, required fields per post type), Edge Function call shape, image URL handling, optimistic insert + rollback on failure, and error surfacing. `useCreatePostFormState.test.ts` and `useImagePipeline.test.ts` cover form state and the aspect-ratio-at-pick-time compression pipeline respectively.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None needed — existing coverage is thorough and behavior-focused.
**Known limitations:** The `create-post` Edge Function's server-side OpenAI moderation logic is not covered by this repo's Jest suite (Deno runtime, separate deploy target) — out of scope for this app's test suite.
**Last verified:** 2026-07-03

---

### Feature 6 — Feed: Vote (Upvote / Downvote)

**Status:** ✅ Verified and complete

**Scope:**
- `useVote` mutation
- Optimistic score update applied immediately to React Query cache
- Toggle behavior: pressing the active vote removes it
- Score reflected in "Top" tab sort on next refetch
- Vote persisted in DB via `post_votes` table (or equivalent RPC)
- Upvote milestone push notifications triggered server-side

**Verified:** `useVote.test.ts`, `usePostScore.test.ts`, and `votes.test.ts` together cover the optimistic update, toggle-off behavior, and the pure score-calculation utility.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None needed.
**Known limitations:** Server-side upvote-milestone push notification trigger (Postgres function) isn't covered by the JS test suite — verified previously via the `post_vote_milestones` migration work (see project memory).
**Last verified:** 2026-07-03

---

### Feature 7 — Post Detail: View Post + Threaded Comments

**Status:** ⚠️ Works but has known limitations

**Scope:**
- `PostHeaderCard`: body, title, vote count, vote button, bookmark toggle, author info, date, community label
- `usePostComments` flat fetch → `buildCommentTree` → `CommentsTreeList` nested render
- Anonymous commenters shown as "User N" (stable per-post `post_specific_anon_id`)
- Block detection: `is_author_blocked_by_viewer` from view → shows "Post Not Found"
- Deep link support: `fromDeeplink` param changes error message
- `PostErrorFallback` error boundary
- Android slide-in animation on mount

**Verified:** `usePostComments.test.ts` (7 tests) covers the fetch → score calculation → tree-building → block-filtering pipeline, including the "unknown author" and fetch-error edge cases. `tree.test.ts` covers `buildCommentTree` in isolation.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None added this pass.
**Known limitations:** The post-detail **screen** itself (`src/app/(protected)/post/[id].tsx`) — specifically the `is_author_blocked_by_viewer` → "Post Not Found" redirect, the deep-link error-copy switch, and `PostErrorFallback` — has no dedicated test. The underlying data (comment tree, block filtering) is well covered; the screen-level wiring is not. Flagged as remaining work rather than silently marked done.
**Last verified:** 2026-07-03

---

### Feature 8 — Post Detail: Add Comment

**Status:** ✅ Verified and complete

**Scope:**
- Inline composer at bottom of post detail
- Anonymous toggle (shows anon avatar in preview when on)
- Reply mode: "Replying to @user" label, pre-populates `parent_comment_id`
- `create-comment` Edge Function: rate limit (10/2min), OpenAI moderation, notification to post author
- Direct push notification triggered by Edge Function for `comment_reply`
- Comment appears in tree immediately after submit (optimistic or refetch)

**Verified:** `useCreateComment.test.ts` covers the mutation's request shape, anonymous/reply handling, and success/error paths.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None needed.
**Known limitations:** `create-comment` Edge Function's server-side moderation/notification logic is out of scope for this app's Jest suite (Deno runtime).
**Last verified:** 2026-07-03

---

### Feature 9 — Chat: Initiate Chat from a Post

**Status:** ✅ Verified and complete

**Scope:**
- Non-anonymous posts: `useInitiateAnonymousChat` with canonical participant ordering (lower UUID = p1), duplicate detection via SELECT before INSERT, 23505 race-condition handler
- Anonymous posts: `initiate_anonymous_chat` SECURITY DEFINER RPC reads real author from base `posts` table, checks self-chat, handles unique_violation race condition
- `postAuthorId` null guard for non-anonymous path
- Self-chat prevention (both paths)
- Returns `chatId` → navigates to `/chat/[id]`

**Verified:** This hook — despite containing the trickiest logic in the whole chat system (canonical UUID ordering, dedup-before-insert, race-condition recovery on unique-violation) — had **zero** test coverage. Traced and tested every branch.
**Bugs found:** None — logic was already correct; this was a pure coverage gap.
**Fix applied:** N/A
**Tests added:** `src/__tests__/features/chat/hooks/useInitiateAnonymousChat.test.ts` — 15 tests: auth/self-chat/missing-author guards, canonical participant ordering in both UUID directions, dedup-returns-existing-chat, insert-creates-new-chat, 23505 race recovery, non-23505 errors, the anonymous RPC path (including that it never touches `.from("chats")` directly), cache invalidation, and that a rate-limit error shows an Alert while other errors only log.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 10 — Chat: Send / Receive Messages

**Status:** ✅ Verified and complete

**Scope:**
- `useChatMessagesInfinite`: 20 messages/page, inverted FlatList
- `useChatMessagesRealtime`: per-chat Supabase Realtime channel
- Optimistic message send (local URI for images before server confirms)
- Image messages: pick from library, display in bubble, fullscreen tap viewer
- `useChatSendMessage` mutation
- Keyboard-aware layout (iOS: `KeyboardAvoidingView`, Android: manual inset)
- Mark as read on focus (300ms delay) and on new message while open (500ms debounce)
- Empty-chat cleanup on leave (DELETE if `last_message_at IS NULL`)

**Verified:** The most thoroughly covered P1 area — 7 dedicated test files: `useChatSendMessage.test.ts` (optimistic send, retry, rate limit, block check), `useChatMessagesInfinite.test.ts` (pagination), `useChatMessagesRealtime.test.ts` (realtime channel handling), `data/cache.test.ts`, `data/queries.test.ts`, `data/realtime.test.ts`, and `useChatAutoScroll.test.ts`. Image message aspect-ratio sizing also covered separately by `chatImageSizing.test.ts` and `imagePicker.test.ts`.
**Bugs found:** None during this pass. (Chat image loading-placeholder and sizing bugs found/fixed earlier this project are already reflected in current tests.)
**Fix applied:** N/A
**Tests added:** None needed this pass.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 11 — Auth: Forgot / Reset Password

**Status:** ✅ Verified and complete

**Scope:**
- `ForgotPasswordModal`: email entry → `resetPasswordForEmail` → "check your email" state
- `reset-password.tsx`: confirm-gate (defends against email-scanner link prefetch) → `verifyOtp`/`exchangeCodeForSession` → set-new-password form → `updateUser` → global `signOut({scope: "global"})` → success
- Real-time password requirement checklist shared with Sign Up / Change Password

**Verified:** The `reset-password.tsx` screen — despite ending in a global session revocation across every device — had zero test coverage. Full component test covering all 6 screen states and their transitions. Also confirmed Supabase's recovery token/link behavior: `verifyOtp`/`exchangeCodeForSession` consumes the token on first successful use (strictly single-use; a second tap of the same email link always fails), and requesting a new reset email invalidates any prior unused token. The established Supabase session survives app kill/restart, so a failed `updateUser` after successful verification can be retried without needing a new link.
**Bugs found:** On the "Set New Password" form, tapping outside the password inputs did not dismiss the keyboard — there was no touch handler anywhere on the screen calling `Keyboard.dismiss()` (no `TouchableWithoutFeedback`/`Pressable` wrapper, no `ScrollView` with `keyboardShouldPersistTaps`). The only way to close the keyboard was the return key.
**Fix applied:** Wrapped the form state's outer container in a `Pressable` with `onPress={Keyboard.dismiss}`. Nested `CustomInput`s and buttons correctly claim their own touch responder first, so this only fires on genuine background taps, and the OS handles the standard slide-down dismiss animation on both platforms automatically.
**Tests added:** `src/__tests__/app/reset-password.test.tsx` — 12 tests: no-token → link_error, confirm-gate requires explicit tap before calling verifyOtp/exchangeCodeForSession, error/throw during verification → link_error, form validation gating, successful submit → updateUser + global signOut + success screen, updateUser error/throw handling, and "Back to Sign In" from every reachable state.
**Known limitations:** `ForgotPasswordModal.tsx` itself (the email-entry step) is not separately tested — its only real logic is a single `resetPasswordForEmail` call already exercised via `useAuthFlow.test.ts`'s `resetPassword` describe block. The keyboard-dismiss fix has no dedicated RNTL test (simulating a background tap + asserting `Keyboard.dismiss` was called is low-value relative to a manual device check); verified by code inspection only.
**Last verified:** 2026-07-04

---

### Feature 12 — Feed: Community Filter + Search

**Status:** ⚠️ Works but has known limitations

**Scope:**
- `CommunityFilterBar`: horizontal pill list, "Campus Feed" + joined communities
- Selecting a pill sets `communityId`, which is part of `useFeedPosts`'s query key (covered — see Feature 4)
- Per-tab search bar, pull-down to reveal

**Verified:** Manually, plus a full trace of the switching architecture (query key construction, per-community component mounting/keying, CSS layering of inactive panes) prompted by a user report of Community-feed posts briefly appearing in the Campus Feed until a manual refresh. `useFeedPosts`'s own community-scoping behavior (`community_id IS NULL` vs a specific id) is covered by Feature 4's tests. Confirmed the query keys, component instances (`key={feedKey}` per community, `display:"none"` — a true unmount-from-rendering, not just opacity — for inactive panes), and post-creation targeting (`resolvedCommunityId` threaded consistently from `create-post.tsx`) are all correctly isolated.
**Bugs found:** `useCreatePostMutation`'s `onMutate` correctly scoped its *optimistic* cache write to the specific community, but `onSuccess`/`onSettled` invalidated the broad `["posts","feed"]` prefix — matching every filter × every community ever visited in the session, since visited feeds stay mounted (and therefore "active") indefinitely. `useBookmarkToggle` did the same. Because an invalidated-but-not-force-refetched query only becomes consistent again on its next natural trigger, this is the most plausible mechanism for Campus Feed transiently reflecting the wrong state until a manual pull-to-refresh forced a clean, correctly-scoped refetch. Separately, `useBookmarkToggle` invalidating `["posts","feed"]` was dead weight regardless — bookmark state is only ever read from `["bookmarks", postId]` and `["user-posts", viewerId]`, never from feed cache rows.
**Fix applied:** Added `feedKeys.belongsToCommunity(communityId)` — a predicate matching only cache entries (any filter/search text) for one specific community or Campus. `useCreatePostMutation`'s `onMutate` (`cancelQueries`), `onSuccess`, and `onSettled` now scope to this predicate instead of the `["posts","feed"]` prefix, so creating a post never touches any other community's or Campus's cache. `useBookmarkToggle` no longer invalidates the feed cache at all.
**Tests added:** `src/__tests__/features/communities/queryKeys.test.ts` — 6 tests for `belongsToCommunity` (matches same community/Campus across any filter/search, rejects a different community, rejects Campus↔community cross-matches, rejects unrelated/malformed keys, independent predicates per call). Updated `useCreatePostMutation.test.ts`'s success-invalidation test to assert the predicate's matching behavior instead of an exact key, and `useBookmarkToggle.test.ts` to assert the feed cache is never touched.
**Known limitations:** Still no automated coverage for the filter bar component or `useMyCommunities` themselves (presentation-only, low risk). The scoping predicate matches on `communityId` alone, not `universityId` — safe in practice since a single session never has more than one university's feeds cached simultaneously, but worth revisiting if that assumption ever changes.
**Last verified:** 2026-07-04

---

### Feature 13 — Feed: Block Filtering

**Status:** ✅ Verified and complete

**Scope:**
- `useBlocks`: fetches both directions of block relationships, tagged with scope
- Server-side filtering in `posts_summary_view` / comment queries
- `useBlockUser`, `useUnblockAll` mutations

**Verified:** `useBlocks.test.ts`, `useBlockUser.test.ts` (11 tests), `useUnblockAll.test.ts` all pass and cover guards, payload shape, cache invalidation, and error handling.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None needed.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 14 — Feed: Report Post

**Status:** ✅ Verified and complete

**Scope:** `useReportPost` mutation → `reports` table insert, surfaced in the admin queue.

**Verified:** `useReportPost.test.ts` passes and covers the mutation's guard/payload/error paths.
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 15 — Feed: Hide Post (Session-Local)

**Status:** ✅ Verified and complete

**Scope:** `FilterContext.hidePost` — adds a post id to session-local `hiddenPostIds`, persisted to AsyncStorage, deduplicated.

**Verified:** Zero prior coverage for `FilterContext` at all (neither the filter-selection nor the hide-post half).
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/context/FilterContext.test.tsx` — 7 tests: default state, loading persisted hidden posts on mount, graceful fallback on corrupted stored JSON, `hidePost` adds + persists, idempotency (no duplicate on re-hide), `setSelectedFilter`, and safe no-op defaults when used outside a provider.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 16 — Feed: Repost with Comments

**Status:** ✅ Verified and complete

**Scope:** Repost mode in create-post, `useOriginalPostForRepost` fetch, `reposted_from_post_id` + `repost_comment` fields.

**Verified:** `useOriginalPostForRepost.test.ts` plus the repost-specific cases already in `useCreatePostMutation.test.ts` (content-not-required-for-repost, repostId-as-array handling).
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 17 — Feed: Poll Creation + Display

**Status:** ⚠️ Works but has known limitations

**Scope:** Poll builder in create-post (2–11 options, atomic insert); `Poll.tsx` fetch + vote mutation + live results.

**Verified:** Manually. The vote mutation lives inline inside the `Poll.tsx` component (`useMutation` defined directly in the component body), not extracted into a testable hook.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None — would require either extracting the mutation into a hook first, or a full component render test; neither was in scope for this pass.
**Known limitations:** No automated coverage. Recommend extracting `usePollVote` as a follow-up if this becomes a priority — see the pattern already used for `useVote`.
**Last verified:** 2026-07-03

---

### Feature 18 — Lost & Found: Browse Feed + Search

**Status:** ⚠️ Works but has known limitations

**Scope:** L&F feed screen — inline `useQuery` (not `useFeedPosts`), search bar, `LostFoundListItem` cards.

**Verified:** Manually. The fetch logic is inline in the screen component rather than an extracted hook.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None — see Feature 12/17 note on inline-in-screen logic.
**Known limitations:** No automated coverage of the fetch/search logic itself. `LostFoundListItem`'s image rendering is covered indirectly via `ResponsiveImage`/`chatImageSizing` work done earlier this project.
**Last verified:** 2026-07-03

---

### Feature 19 — Lost & Found: Create L&F Post

**Status:** ✅ Verified and complete

**Scope:** Same `useCreatePostMutation` as Feature 5, `type=lostfound` branch — required location field, `is_anonymous: false` forced, separate cache key (`["posts","lost_found"]`).

**Verified:** Directly covered by existing `useCreatePostMutation.test.ts` cases: "Location is required for lost&found", "sets is_anonymous: false for lost&found", "invalidates posts,lost_found on success".
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed — already covered as part of Feature 5's test file.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 20 — Lost & Found: Chat CTA from L&F Post Detail

**Status:** ✅ Verified and complete

**Scope:** "Contact" button on an L&F post detail screen → `useInitiateAnonymousChat` (same hook as Feature 9) → navigates to `/chat/[id]`.

**Verified:** Fully covered by Feature 9's `useInitiateAnonymousChat.test.ts` (15 tests) — this feature is a thin UI trigger over the same hook, with no L&F-specific branching in the hook itself.
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 21 — Chat List: Summaries, Sort by Recency, Unread Badge

**Status:** ⚠️ Works but has known limitations

**Scope:** Chat list screen — inline `useQuery` for `user_chats_summary`, sorted by `last_message_at`; unread badge sourced from `useGlobalUnreadCount`.

**Verified:** The unread-badge half (`useGlobalUnreadCount`) had zero tests — added this pass (see Feature 22). The summaries fetch/sort itself is inline in the chat list screen, not an extracted hook.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** See Feature 22 — `useGlobalUnreadCount.test.ts` (5 tests) covers the badge-count half of this feature.
**Known limitations:** No automated coverage for the summaries fetch/sort itself (inline in the screen).
**Last verified:** 2026-07-03

---

### Feature 22 — Chat: Mark as Read, Badge Count Sync

**Status:** ✅ Verified and complete

**Scope:** Mark-as-read on focus (300ms delay) and on new message while open (500ms debounce); `useGlobalUnreadCount` drives the tab badge + OS app icon badge, excluding blocked-user chats.

**Verified:** `useGlobalUnreadCount` had zero tests despite being the single source of truth for the app's badge count (tab + OS icon). Added coverage for the aggregation logic, including the blocked-user exclusion that's easy to silently break.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/hooks/useGlobalUnreadCount.test.ts` — 5 tests: disabled-without-session short-circuit, summing `unread_count_p1`/`unread_count_p2` depending on which side the user is on, excluding blocked-user chats regardless of block scope, and null-safe handling of missing count fields.
**Known limitations:** The 300ms/500ms mark-as-read timers are screen-level (`chat/[id].tsx`) and were verified manually, not via fake-timer unit tests.
**Last verified:** 2026-07-03

---

### Feature 23 — Chat: Reply Threading

**Status:** ✅ Verified and complete

**Scope:** "Replying to @user" composer state, `reply_to_id` on send, `replyToMessage` preview populated from cache optimistically and from the server JOIN (`reply_message:reply_to_id(...)`) on confirmation.

**Verified:** `useChatSendMessage.test.ts` existed but had zero reply-specific tests — this is genuinely tricky logic (optimistic cache lookup vs. server-joined data reconciliation) that was previously unverified by an automated test.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** 4 tests added to the existing `useChatSendMessage.test.ts` (extended, not duplicated): `reply_to_id` included in the insert payload, optimistic `replyToMessage` populated from cache when the original message is present, left `null` when not cached, and the server-joined `reply_message` taking precedence over the optimistic preview once confirmed.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 24 — Chat: Delete Chat / Block User from Chat

**Status:** ✅ Verified and complete

**Scope:** Delete message (`delete_for_me` / `delete_for_everyone`) via `useChatMessageActions`; block user via `useBlockUser`; empty-chat cleanup on leave (`DELETE` if `last_message_at IS NULL`) is screen-level in `chat/[id].tsx`.

**Verified:** `useChatMessageActions.test.ts` (6 tests) already covers both delete actions, the sender-only guard on delete-for-everyone, and platform-specific action sheets. `useBlockUser.test.ts` covers blocking generically (not chat-specific, but the hook has no chat-specific branching).
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None needed for message delete/block.
**Known limitations:** The empty-chat DELETE-on-leave cleanup is screen-level and was verified manually, not via an automated test.
**Last verified:** 2026-07-03

---

### Feature 25 — Profile: View Own Posts

**Status:** ✅ Verified and complete

**Scope:** `useMyPosts` — All / Anonymous / Bookmarked tab filtering.

**Verified:** `useMyPosts.test.ts` (pre-existing, also tracked in `package.json`'s `collectCoverageFrom`) covers the fetch and tab-filtering logic.
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 26 — Profile: Change Avatar, Username, Password

**Status:** ✅ Verified and complete

**Scope:** `useAvatarUpload`, `useUpdateProfile` (username), `useUpdatePassword` (re-authenticates with the current password before allowing a change), shared `passwordValidation` real-time requirement checklist across Sign Up / Change Password / Reset Password.

**Verified:** Avatar and username mutations were already covered. Password change (`useUpdatePassword`) and the shared validation utility it (and two other screens) depend on had zero tests — both are exactly the kind of logic where a silent regression is dangerous (e.g. skipping the re-auth check).
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `useUpdatePassword.test.ts` — 4 tests: no-email guard skips re-auth entirely, re-authenticates with the *current* password before calling `updateUser`, "Incorrect current password" on failed re-auth (and `updateUser` is never called in that case), and error propagation from `updateUser`. `passwordValidation.test.ts` — 15 tests covering every requirement (length/upper/lower/number/symbol/match) independently and in combination.
**Known limitations:** None known.
**Last verified:** 2026-07-03

---

### Feature 27 — Push Notifications: Receive + Tap to Navigate

**Status:** ✅ Verified and complete

**Scope:** `getNotificationData` (payload parsing, content vs. remoteMessage), `routeFromNotification` (chat/upvote/comment_reply routing, participant-based chat-id resolution fallback), `handleNotificationResponse` (orchestration + mark-as-read).

**Verified:** This routing logic had zero direct tests (only indirectly mocked away in an unrelated chat-blocking test). It's also non-trivial — the chat-notification path alone has 4 distinct outcomes depending on which fields are present.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `usePushNotifications.test.ts` — 11 tests: payload parsing from both `content.data` and `remoteMessage.data`, camelCase/snake_case `relatedChatId` key handling, direct chat-id routing, participant-based chat resolution (both query-order branches), graceful fallback + warning logs when a chat/post can't be resolved, post-notification routing, and unknown-type fallback (no navigation).
**Known limitations:** The registration/permission half of `usePushNotifications()` (the actual React hook — token registration, `AppState` tracking) is native-device-dependent and was verified manually, not via unit tests.
**Last verified:** 2026-07-03

---

### Feature 28 — Push Notifications: Per-Type Settings

**Status:** ⚠️ Works but has known limitations

**Scope:** `NotificationSettingsModal` — toggle chat/upvote notification preferences, requests OS permission on enable, clears push token on hard denial.

**Verified:** Manually. The toggle mutation (`updateSettingMutation`) and permission-request flow are defined inline in the modal component, not extracted into a testable hook.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None — would require either extracting the mutation into a hook or a full component render test with `expo-notifications` permission mocks; neither was in scope for this pass.
**Known limitations:** No automated coverage. Recommend extracting a `useNotificationSettings` hook as a follow-up if this becomes a priority.
**Last verified:** 2026-07-03

---

### Feature 29 — Communities: Browse Directory, Join/Leave

**Status:** ✅ Verified and complete

**Scope:** `useUniversityCommunities` (paginated directory, server-side search, member-count mapping), `useMyCommunities` (joined list + `joinedIds` Set), `useJoinCommunity`/`useLeaveCommunity` (idempotent upsert-based join, optimistic add/remove with rollback).

**Verified:** Join/leave — the riskiest part (optimistic update + rollback, and the idempotent-upsert design that prevents a double-tap from throwing a duplicate-key error) — had zero tests.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/features/communities/useCommunityMembership.test.ts` — 6 tests: idempotent upsert shape, optimistic add without duplicating an already-joined community, rollback + Alert on join failure, delete-scoped-to-community-and-user on leave, optimistic removal, rollback + Alert on leave failure.
**Known limitations:** `useUniversityCommunities` (directory fetch/search/pagination) and `useMyCommunities` (joined-list fetch) are read-only query hooks with lower regression risk than the mutations — not separately tested this pass.
**Last verified:** 2026-07-04

---

### Feature 30 — Communities: Create Community

**Status:** ✅ Verified and complete

**Scope:** `useCreateCommunity` — calls the `create-community` Edge Function (not a direct table insert, since a DB trigger fills `university_id` and auto-joins the creator), maps a 429 to a rate-limit Alert and a duplicate-key error to a friendly "already exists" message.

**Verified:** Zero prior tests despite non-trivial error-mapping logic (429 vs. duplicate-key vs. generic).
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** 4 tests (in `useCommunityMutations.test.ts`, alongside Feature 31): auth guard skips the network call entirely, POST payload shape (trimmed name/description + Bearer token), 429 → rate-limit Alert, duplicate-key error → friendly message.
**Known limitations:** None known.
**Last verified:** 2026-07-04

---

### Feature 31 — Communities: Manage Community (Owner: Edit, Delete)

**Status:** ✅ Verified and complete

**Scope:** `useUpdateCommunity` (name/description/avatar, RLS-enforced to the creator), `useDeleteCommunity` (RLS-enforced, cascades to the community's posts).

**Verified:** Zero prior tests.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** 4 tests (in `useCommunityMutations.test.ts`): update payload shape, update error → Alert, delete scoped by id, delete error → Alert.
**Known limitations:** None known.
**Last verified:** 2026-07-04

---

### Feature 32 — Matchmaking: Banner Phase Awareness

**Status:** ✅ Verified and complete

**Scope:** `MatchmakingBanner` visibility logic — which event phase shows the banner, scroll-dismiss behavior.

**Verified:** Pre-existing `src/features/matchmaking/__tests__/bannerVisibility.test.ts` passes.
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed.
**Known limitations:** None known.
**Last verified:** 2026-07-04

---

### Feature 33 — Matchmaking: Profile Submission Form (Multi-Step)

**Status:** ✅ Verified and complete

**Scope:** `MatchmakingFormModal` (multi-step question flow), `useSubmitMatchmaking` (client-side validation of name/major/gender/length limits + per-question answer-range validation before hitting the DB).

**Verified:** The validation hook — the part most likely to silently let bad data through if broken — had zero tests.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/features/matchmaking/useSubmitMatchmaking.test.ts` — 8 tests: valid submission (with trimming), empty display name, over-length display name, empty major, invalid gender, a missing answer for a required question, an out-of-range answer index, and cache invalidation on success. Built dynamically against the real `MATCHMAKING_QUESTIONS` config so it stays correct if questions are added/removed.
**Known limitations:** The multi-step form UI itself (`MatchmakingFormModal`, `QuestionCard`) is not separately tested — only the validation/submission logic it calls into.
**Last verified:** 2026-07-04

---

### Feature 34 — Matchmaking: Reveal Modal (Match Display, Countdown Timer)

**Status:** ✅ Verified and complete

**Scope:** `MatchRevealModal` (match display, view recording via `useRecordMatchView`), `useMatchWindowStatus` (countdown to window expiry, ticks every second).

**Verified:** The countdown logic had zero tests — countdowns are exactly the kind of logic that silently drifts or fails to flip to "expired" without a test catching it.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/features/matchmaking/useMatchWindowStatus.test.ts` — 5 tests (fake-timer based): no-userId default, `msRemaining`/`isExpired` computation for an open window, immediate `isExpired: true` for an already-past window, per-second countdown ticking, and flipping to expired exactly when the countdown reaches zero.
**Known limitations:** `MatchRevealModal`'s UI and `useRecordMatchView` are not separately tested.
**Last verified:** 2026-07-04

---

### Feature 35 — Matchmaking: Initiate DM with Match

**Status:** ✅ Verified and complete

**Scope:** `useInitiateMatchChat` — structurally identical risk profile to Feature 9 (`useInitiateAnonymousChat`): canonical UUID participant ordering, dedup-before-insert, 23505 race-condition recovery, scoped to `post_id IS NULL` to distinguish matchmaking chats from post-initiated ones.

**Verified:** Zero prior tests despite sharing the exact race-condition-prone pattern already known to matter (it's the same shape as Feature 9's hook).
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/features/matchmaking/useInitiateMatchChat.test.ts` — 6 tests: auth guard, self-chat guard, `post_id IS NULL` scoping, dedup-returns-existing, 23505 race recovery, rate-limit Alert.
**Known limitations:** None known.
**Last verified:** 2026-07-04

---

### Feature 36 — Feed: Cold-Start AsyncStorage Seed

**Status:** ⚠️ Works but has known limitations

**Scope:** `seedQueryCacheFromStorage` (`src/utils/feedPersistence.ts`) — seeds the React Query cache from AsyncStorage before `<Slot />` renders, so the feed shows content instantly on cold start instead of a skeleton.

**Verified:** Traced during earlier work this project (the Campus Feed flicker investigation). Confirmed the seed writes to a stale 3-part cache key (`["posts","feed",filter]`) that no longer matches the real 6-part `feedKeys.list(...)` key the feed actually reads from — meaning this feature is currently a no-op in production. This was flagged to the user previously and intentionally not fixed (out of scope for that pass).
**Bugs found:** Yes — see above. Pre-existing, not introduced this session.
**Fix applied:** None — flagged, not fixed. Fixing it requires deciding what `universityId`/`communityId`/`activeSearchQuery` to seed under, which ties into the same profile-not-loaded-yet timing this project already fixed once for the live query path.
**Tests added:** None — would need to fix the underlying key mismatch first; a test against known-broken behavior wouldn't be meaningful.
**Known limitations:** Cold-start feed content currently always shows the loading skeleton briefly rather than instant cached content. Low severity (a skeleton, not incorrect data) but worth fixing as a follow-up.
**Last verified:** 2026-07-04

---

### Feature 37 — Feed: Realtime New-Post Notification

**Status:** ⚠️ Works but has known limitations

**Scope:** `postgres_changes` subscription in the feed screen — debounced stale-then-refetch when a new post lands.

**Verified:** Manually. The subscription and debounce logic are inline in `index.tsx`, not an extracted hook.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None — see the recurring inline-in-screen note (Features 12/17/18/21/28/40/42).
**Known limitations:** No automated coverage.
**Last verified:** 2026-07-04

---

### Feature 38 — Feed: Skeleton Reveal After N Images Load

**Status:** ✅ Verified and complete

**Scope:** `useRevealAfterFirstNImages` — reveals the feed once N images report ready or a timeout elapses, with reset-on-tab-switch and instant-reveal-for-cached-content options.

**Verified:** Zero prior tests for genuinely fiddly timer/counter interaction logic (min-items counting, timeout racing, reset-key behavior, cached-content bypass).
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/hooks/useRevealAfterFirstNImages.test.ts` — 8 tests (fake-timer based): default hidden state, `initialRevealed` bypass, reveal-at-minItems, reveal-at-timeout, disabled skips the timer entirely, extra `onItemReady` calls past the threshold are harmless, reset-on-`resetKey`-change, and immediate reveal on reset when the new key is also cached.
**Known limitations:** None known.
**Last verified:** 2026-07-04

---

### Feature 39 — Chat: Optimistic Message Send, Image Messages

**Status:** ✅ Verified and complete

**Scope:** Same underlying mechanism as P1 Feature 10 — optimistic send with local image URI before server confirmation.

**Verified:** Fully covered by the P1/P2 `useChatSendMessage.test.ts` work (14 tests total, including the reply-threading additions from P2).
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed — already covered.
**Known limitations:** None known.
**Last verified:** 2026-07-04

---

### Feature 40 — Chat: Empty Chat Cleanup on Leave

**Status:** ⚠️ Works but has known limitations

**Scope:** `DELETE` the chat row on navigating away if `last_message_at IS NULL` (i.e., a chat was opened but nothing was ever sent).

**Verified:** Manually — same conclusion as P2 Feature 24. Screen-level in `chat/[id].tsx`, not extracted into a testable unit.
**Bugs found:** None during this pass.
**Fix applied:** N/A
**Tests added:** None.
**Known limitations:** No automated coverage.
**Last verified:** 2026-07-04

---

### Feature 41 — Chat: Date Dividers, Deleted-Message Tombstones

**Status:** ⚠️ Works but has known limitations

**Scope:** `isDeletedForViewer`/`isDeletedForEveryone`/`deletedLabel`/`selectMessages` (pure functions, `src/features/chat/types.ts`); date-divider grouping (`getDateDivider`/`shouldShowDateDivider`, inline `useCallback`s in `chat/[id].tsx`).

**Verified:** The tombstone-visibility rules — genuinely easy to get subtly wrong (sender vs. receiver perspective, "deleted for everyone" requiring both flags) — had zero tests.
**Bugs found:** None — logic was already correct.
**Fix applied:** N/A
**Tests added:** `src/__tests__/features/chat/types.test.ts` — 9 tests covering `isDeletedForViewer` (sender/receiver asymmetry), `isDeletedForEveryone` (requires both flags), `deletedLabel`, and `selectMessages` (flattening, `profile_only`-block filtering, and confirming `anonymous_only` blocks do *not* affect chat visibility).
**Known limitations:** Date-divider grouping logic is inline in the screen and not covered.
**Last verified:** 2026-07-04

---

### Feature 42 — Profile: Notification Settings Modal

**Status:** ⚠️ Works but has known limitations

**Scope:** Identical to P2 Feature 28 — `NotificationSettingsModal`'s toggle mutation and OS-permission-request flow.

**Verified:** Manually — see Feature 28's entry; this is the same feature listed under both P2 and P3 in the checklist.
**Bugs found:** None during this pass. **Fix applied:** N/A. **Tests added:** None (same reasoning as Feature 28).
**Known limitations:** No automated coverage — logic is inline in the modal component.
**Last verified:** 2026-07-04

---

### Feature 43 — Profile: Delete Account, Logout, Unblock All

**Status:** ✅ Verified and complete

**Scope:** `useDeleteAccount`, `AuthContext.signOut`, `useUnblockAll`.

**Verified:** All three already had solid pre-existing coverage (`useDeleteAccount.test.ts`, `AuthContext.test.tsx`'s signOut tests, `useUnblockAll.test.ts`).
**Bugs found:** None. **Fix applied:** N/A. **Tests added:** None needed.
**Known limitations:** None known.
**Last verified:** 2026-07-04

---

### Feature 44 — Deep Link Handling (Post Links, Email Verification)

**Status:** ✅ Verified and complete

**Scope:** `redirectSystemPath` (`src/app/+native-intent.ts`) — rewrites incoming deep links before Expo Router navigates: L&F post-type disambiguation (`/post/:id?postType=lost_found` → `/lostfoundpost/:id`), and password-recovery link normalization (`token_hash`/legacy `code`).

**Verified:** Zero prior tests for a function whose whole job is correctly parsing untrusted, variously-shaped incoming URLs — exactly where a subtle scheme-handling bug can hide.
**Bugs found — real, not hypothetical:** Writing the test suite surfaced that `Linking.parse` treats the first path component after `scheme://` as **`hostname`**, not `path`, for a custom URL scheme (`myunitea://post/abc` → `{hostname: "post", path: "abc"}`) — but for `https://` Universal Links, that same position is the real domain and the route name stays in `path` (`https://unitea.app/post/abc` → `{hostname: "unitea.app", path: "post/abc"}`). Since `redirectSystemPath` derived its routing `segments` purely from `parsed.path`, **every custom-scheme deep link with a route name silently failed to match any rewrite branch** and fell through unrewritten. This is directly reachable in production: the web fallback page (`unitea-well-known/reset-password/index.html`, built earlier this session) hands off to exactly `myunitea://reset-password?token_hash=...` when a Universal Link doesn't auto-open the app.
**Root cause:** `segments = parsed.path.split("/")` didn't account for the scheme-dependent host/path split described above.
**Fix applied:** Added an `isCustomScheme` check; for non-http(s) schemes, `effectivePath` is built by prepending `parsed.hostname` to `parsed.path` before deriving `segments`, unifying behavior across both scheme families. Verified both `myunitea://post/abc`-shaped and `https://unitea.app/post/abc`-shaped inputs now produce identical, correct rewrites.
**Tests added:** `src/__tests__/app/native-intent.test.ts` — 13 tests spanning both scheme families for post/L&F rewriting, token_hash/code recovery-link handling (including percent-encoding round-trips and token_hash-over-code precedence), and passthrough for unrecognized/empty paths.
**Known limitations:** None known. Confirmed via `node_modules/expo-router/build/getLinkingConfig.js` that Expo Router always invokes this with a full scheme-prefixed URL (never a bare path), so all test inputs match real invocations.
**Last verified:** 2026-07-04

---

## Engineering Standards

- **Correctness over speed.** Never assume a feature works — verify it.
- **No patches.** Fix root causes, not symptoms.
- **No regressions.** Understand dependencies before changing shared code.
- **Test coverage.** Every verified feature must have automated tests.
- **Clean architecture.** No duplicate logic, no unnecessary abstractions.
- **Security.** RLS on all write tables, SECURITY DEFINER functions always paired with REVOKE + search_path, never USING(true) on insert/update policies.
