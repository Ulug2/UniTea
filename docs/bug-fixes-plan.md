Goals
Avatar change: Make tapping “Change Avatar” reliably open the image picker, keep the UX stable while uploading, and avoid confusing modal closures.
Username change & tab freeze: Ensure that changing username does not cause odd scroll jumps or a "frozen" profile list when switching tabs, especially on iOS.
Repost media: Display original post media (image, poll) inside reposts in feed and detail views when present.
Repost navigation: From a repost’s detail view, allow tapping the embedded original post section to navigate to the original post’s detail screen.
Key files to touch

Profile & settings
[src/app/(protected)/(tabs)/profile.tsx](src/app/(protected)/(tabs)/profile.tsx) – handlers for avatar and username updates, modal visibility.
[src/components/ManageAccountModal.tsx](src/components/ManageAccountModal.tsx) – UI for Change Avatar and Change Username.
[src/features/profile/hooks/useAvatarUpload.ts](src/features/profile/hooks/useAvatarUpload.ts) – avatar upload and profile mutation logic.
[src/features/profile/hooks/useUpdateProfile.ts](src/features/profile/hooks/useUpdateProfile.ts) – shared profile update + query invalidation.
[src/features/profile/components/ProfilePostsList.tsx](src/features/profile/components/ProfilePostsList.tsx) and the useMyPosts hook – profile posts list, refresh and pagination flags.

Posts, reposts, and detail
[src/types/posts.ts](src/types/posts.ts) and [src/types/database.types.ts](src/types/database.types.ts) – PostsSummaryViewRow and view schema fields for original media/poll.
[src/components/PostListItem.tsx](src/components/PostListItem.tsx) – core post/repost rendering, including original post card and poll rendering.
[src/features/posts/components/PostHeaderCard.tsx](src/features/posts/components/PostHeaderCard.tsx) – detail header wrapper around PostListItem.
[src/app/(protected)/post/[id].tsx](src/app/(protected)/post/[id].tsx) – post detail screen.
[src/app/(protected)/(tabs)/index.tsx](src/app/(protected)/(tabs)/index.tsx) – main feed mapping from PostsSummaryViewRow to PostListItem props.

Implementation steps
1) Fix avatar change flow
1.1 Refine avatar update handler in profile.tsx:
Update handleAvatarUpdate to be async and await startAvatarUpload() from useAvatarUpload.
Only close the ManageAccountModal (setManageAccountVisible(false)) after a successful upload, and keep it open or show an error if the user cancels or the upload fails.
Optionally add a simple loading flag (e.g., isUpdatingAvatar) to disable the Change Avatar button while the picker/upload is in progress.
1.2 Improve error and cancel handling in useAvatarUpload.ts:
Make startAvatarUpload return a status (e.g., { status: 'success' | 'cancelled' | 'error' }) instead of being fire-and-forget.
Treat a cancelled picker selection as a no-op in the UI, without closing the settings sheet.
Surface upload or permission errors (e.g., via Alert.alert) so the user understands what happened when nothing changes.
1.3 Verify iOS-specific behavior:
Confirm on iOS that the picker appears above the bottom sheet and that the bottom sheet does not immediately close before the picker.
If necessary, adjust modal behavior (e.g., temporarily hide the sheet during picker interaction, then restore it) to avoid visual glitches.

2) Stabilize username change and tab behavior





2.1 Scope query invalidation more carefully in useUpdateProfile.ts:





Avoid invalidating heavy, scroll-heavy queries like ['posts'] and ['user-posts'] on every username change, or ensure that refetching does not reset scroll position unnecessarily.



If username changes don’t actually alter the profile’s post list, limit invalidation to user/profile-related keys (e.g., ['current-user-profile'], chat-related keys) to reduce cascade rerenders.



2.2 Review useMyPosts and ProfilePostsList interactions:





Ensure that isRefetching, isFetchingNextPage, and hasNextPage are set correctly when a profile update occurs and when the active profile tab changes.



Confirm that refreshing={isRefetching} in ProfilePostsList does not leave the FlatList in a permanent refreshing state; if needed, decouple refetches triggered by profile changes from the pull-to-refresh state.



Maintain stable keys and data shapes across tab changes so that FlatList does not unnecessarily remount and jump the scroll position.



2.3 Add defensive guards for iOS tab transitions:





Where the tab switch triggers data refetches, ensure any scrollToOffset or onEndReached logic doesn’t run while the list is mid-refresh.



If necessary, gate heavy refetches behind explicit user actions (e.g., pull-to-refresh) instead of automatic invalidations from minor profile changes.

3) Show original media (image/poll) in reposts





3.1 Extend data model for original media:





Update posts_summary_view schema and its TypeScript types to include fields for original media, e.g. original_image_url and original poll configuration (or at least original_has_poll / original_poll_id).



Reflect those fields in [src/types/posts.ts](src/types/posts.ts) within PostsSummaryViewRow and in [src/types/database.types.ts](src/types/database.types.ts) so they are accessible across feed and detail views.



3.2 Wire original media into feed and detail props:





In the main feed (index.tsx) and detail header (PostHeaderCard.tsx), pass the new original media fields through to PostListItem as explicit props (e.g., originalImageUrl, originalPollPostId).



3.3 Update PostListItem to render original media:





Inside the repost branch (isRepost), render:





Original image inside originalPostCard when originalImageUrl is present, using the same SupabaseImage component and sizing rules as regular post images.



Original poll for reposts, gated on presence of original poll data, e.g. <Poll postId={original_post_id} /> or an equivalent prop if the poll data is denormalized.



Preserve the existing behavior where the repost wrapper can still have its own image/comment separately from the original content.

4) Enable navigation from original post section inside repost detail





4.1 Make original post card pressable in PostListItem:





Wrap the originalPostCard view in a Pressable or Link when original_post_id is available.



On press, navigate to /post/${original_post_id} using the router.



4.2 Avoid conflicting with the outer card Link:





Since the entire PostListItem is currently wrapped in a Link to the repost (/post/${postId}), ensure that clicks on the original card:





Call e.stopPropagation() / e.preventDefault() (for Pressable events) before calling router.push to the original post.



Or, in detailed-post context (isDetailedPost && isRepost), relax the outer Link and rely on explicit press handlers for both repost and original parts.



4.3 Apply behavior consistently in feed and detail:





Ensure the same original-card press behavior works both:





When viewing a repost in the feed (tapping the original section goes to its detail), and



When already on the repost’s detail screen (tapping the original still navigates to the original’s detail).

5) Testing and regression checks





5.1 Avatar & username flows (iOS):





On iOS, from the profile screen:





Open Manage Account, tap Change Avatar, confirm that the picker appears and the sheet doesn’t just close with no UI.



Complete avatar selection and see the avatar update on profile; verify the sheet closes only after success.



Change username, then switch tabs multiple times and confirm no strange scroll jumps or frozen list state; pull-to-refresh should still work.



5.2 Repost behavior:





Create a post with an image and with a poll; repost it with and without additional comment/image.



In the feed and in the detailed view of the repost:





Verify that the original image and poll are shown inside the original section.



Tap the original section and ensure navigation to the original post’s detail screen.



5.3 Lint and type safety:





Run TypeScript and lint checks after schema/type changes to ensure PostsSummaryViewRow and all PostListItem usages compile cleanly.



Adjust any affected queries or mappers that consume posts_summary_view to include the new original media fields.

