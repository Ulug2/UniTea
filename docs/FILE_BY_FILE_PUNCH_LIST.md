High-impact maintainability punch list (what to refactor, where, and how)
Below is a prioritized list of concrete clean-code violations (per your docs/CLEAN_CODE_GUIDE.md) and the exact refactor targets I’d create. I’m focusing on the biggest ROI: files that are too large / do too many things, duplicated types/logic, and TypeScript safety leaks (any / as any).
P0 (biggest wins)
src/app/(protected)/chat/[id].tsx (2416 lines)
Concerns
SRP violation: chat UI + pagination + realtime + optimistic sending + image picking/upload + rate limiting + fullscreen pinch/zoom gesture handling all in one file.
Type safety leaks: many any-typed gesture/event handlers and error handling.
Magic constants scattered (limits, time windows, clamp values).
Refactor targets
Hooks
useChatMessagesQuery(chatId)
useChatRealtime(chatId, queryClient) (subscribe/unsubscribe, dedupe, cache updates)
useChatComposer() (message text, attachments, send action, rate limit)
useFullscreenImageViewer() (pan responder + animated state)
Components
ChatHeader, ChatMessageList, ChatComposer, FullscreenImageModal
Types
ChatMessageViewModel (local optimistic fields separated from DB row fields)
src/app/(protected)/(tabs)/profile.tsx (1342 lines)
Concerns
SRP: profile data + uploads + settings modals + posts list + memoized post item + theming.
TypeScript: theme: any in ProfilePostItemProps is a direct guide violation.
Duplicated PostSummary type (also exists elsewhere).
Refactor targets
ProfileHeader, ProfileActions, ProfilePostsTab, ProfileSettingsTab
useProfile(userId), useProfilePosts(userId), useAvatarUpload()
Export a proper Theme type from ThemeContext and use it instead of any.
src/app/(protected)/post/[id].tsx (1180 lines)
Concerns
SRP: post detail + comments tree building + comment mutations + list performance tuning in one file.
“Too many props” symptoms at call sites (like the big PostListItem props list).
Refactor targets
usePostDetail(postId), useCommentsTree(postId), useCommentComposer(postId)
PostHeader, PostBody, PostActions, CommentsTree, CommentComposer
Pass a single “view model” object into PostListItem rather than 30 props.
src/app/(protected)/create-post.tsx (1059 lines)
Concerns
SRP: create feed post + lost/found post + repost + poll + image pipeline in one file.
Magic values for image processing (resize widths/compress/format).
Refactor targets
useCreatePostForm({ type, repostId }) (state + validation)
useImagePipeline() (pick → manipulate → upload)
useCreatePostMutation() (payload building + mutation)
Split UI: PostTypeSelector, PollEditor, LostFoundFields, RepostPreview, ImagePickerField
src/components/Auth.tsx (930 lines)
Concerns
UI + validation + rate limiting + async orchestration in one component.
Uses catch (error: any) and logs with details?: any (via logger calls).
Has magic strings (Notion URLs) embedded.
Refactor targets
useAuthForm() (mode switching + validation + loading state)
useRateLimit() (shared logic)
Extract TERMS_URL/PRIVACY_URL into a config/constants module.
P1 (important structural hygiene)
src/components/PostListItem.tsx (686 lines)
Concerns
Overly wide props surface (many unused props right now).
Fragile React.memo comparator: easy to miss props that affect rendering/behavior.
Refactor targets
Replace many props with a single post view-model prop + ui options.
Break into PostHeader, PostContent, PostFooter, RepostCard.
Prefer default memoization (or carefully typed, tested comparator) and keep prop shape small.
src/components/CommentListItem.tsx (660 lines)
Concerns
Side effects in render on Android layout animation enablement (harder to reason about; should be one-time).
Lots of UI state + mutations + modals inside one component.
Refactor targets
useCommentActions(comment) for delete/report/block flows
CommentHeader, CommentBody, CommentActions, RepliesList
src/app/(protected)/(tabs)/index.tsx + lostfound.tsx + profile.tsx
Concern: duplicated PostSummary type in 3 files
index.tsx, lostfound.tsx, profile.tsx all define essentially the same shape.
Refactor target
Create one shared type like PostsSummaryViewRow in src/types/posts.ts (or src/features/posts/types.ts) and import it everywhere.
src/app/(protected)/(tabs)/chat.tsx (chat list)
Concerns
Uses (supabase as any) because the view isn’t typed, and later payload.new as any.
Contains subscription + cache update logic in the screen.
Refactor targets
Define a typed ChatSummary once (good start already), then wrap supabase access in a small data layer:
fetchChatSummaries(userId): Promise<ChatSummary[]>
subscribeChatUpdates(userId, onUpdate)
Move view typing into a shared types/views.ts and remove repeated as any.
Example of the “view not typed → as any” smell:
chat.tsx
Lines 55-72
// Type cast needed since view isn't in generated typesconst { data, error } = await (supabase as any)  .from("user_chats_summary")  .select("*")
src/hooks/usePushNotifications.ts
Concerns
Module-level side effects + globals (currentAppState, currentViewedChatPartnerId) make behavior “spooky action at a distance”.
Uses Promise.race(... ) as any and catch (error: any).
usePushNotifications.ts
Lines 22-27
const appStateSubscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {    currentAppState = nextAppState;});
Refactor targets
Wrap globals into a small module with explicit API (notificationState.ts) + unit-testable helpers.
Replace any with unknown and narrow.
Strongly type the Promise.race result (don’t cast to any).
src/utils/votes.ts
Concerns
Repeated console.error instead of centralized logger.
lastError: any, catch (error: any) violates your TS rule.
Retry helper exists here and also elsewhere (duplication).
Refactor targets
retryOperation.ts shared utility (generic, typed with unknown)
Use logger instead of console.*
Consider a VotesService layer so UI hooks don’t reimplement patterns.
src/utils/supabaseImages.ts
Concerns
Contains retry+timeout logic (good) but uses any for errors and also uses console.warn/error.
Mixes concerns: validation + upload + download + URL building.
Refactor targets
Split into:
imageValidation.ts
retry.ts (shared)
storageUpload.ts / storageDownload.ts
Replace any with unknown, normalize errors, log via logger.
src/components/SupabaseImage.tsx
Concerns
Does a HEAD request to detect public buckets (reasonable, but it’s a subtle policy decision embedded inside a UI component).
Uses console.error (inconsistent with logger).
React.memo comparator only checks path/bucket/contentFit, ignoring other props (could cause stale behavior if other props change).
Refactor targets
Move “public vs private bucket detection” into a storage utility/service.
Ensure memoization strategy matches real props that affect rendering.
src/components/UserProfileModal.tsx
Concerns
(supabase as any) and .reduce((sum, post: any) => ...) breaks TS rules and hides schema issues.
Querying posts_summary_view in UI component; total votes is a domain concern.
Refactor targets
Add a typed query helper: fetchUserTotalVotes(userId): Promise<number>
Replace any with a typed row: { vote_score: number | null }[] (or shared view type).
P2 (cleanups that pay off after P0/P1)
src/components/LostFoundListItem.tsx
Concerns
Duplicates retryOperation again (same pattern as votes.ts / supabaseImages.ts).
lastError: any, catch (error: any), console.log/error.
Refactor targets
Shared retry utility + typed error normalization + logger.
Extract “start chat for post” into useStartChat({ postId, userId }).
A practical refactor order (so it doesn’t explode)
Step 1 (types + utilities): centralize PostSummary + add shared retryOperation + replace any in logger signatures.
Step 2 (component APIs): shrink PostListItem and LostFoundListItem prop surfaces (pass view models).
Step 3 (break up monsters): refactor chat/[id].tsx first (highest complexity), then post/[id].tsx, then profile.tsx, then create-post.tsx.
Step 4 (consistency): replace console.* with logger, convert catch (error: any) → unknown + narrowing across the repo.
If you want, I can go one level deeper for one file at a time (starting with src/app/(protected)/chat/[id].tsx) and produce a “cut plan” that lists exactly which blocks become which hook/component, and what their input/output types should be—still in Ask mode, no edits.