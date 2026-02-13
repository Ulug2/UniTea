## Cut Plan: `src/app/(protected)/post/[id].tsx` (Post detail + comments)

### Why this file needs a cut
- **SRP violation**: one module handles post fetching, author fetching, blocked-user logic, comment fetch + enrichment (profiles + votes), comment tree building, comment composer UI, optimistic updates, delete/report/block/bookmark flows, and list rendering/perf tuning.
- **Hard to test/change**: data logic is mixed directly with rendering and mutations.
- **Type safety leak**: `useQuery<any>` for `posts_summary_view` hides your actual view model type.

### Goals (definition of done)
- Screen becomes a **thin orchestrator** that:
  - reads `postId`
  - calls 3–5 hooks
  - renders a small set of components.
- Comment logic is split into **query/enrichment**, **tree building**, and **composer**.
- `posts_summary_view` has a real TypeScript type (no `any`).
- Behavior preserved: nested replies, blocked filtering, optimistic comment insert, bookmark toggle, moderation edge function call, report/block.

---

## Current responsibilities → extraction targets

### A) Routing + layout shell
- **Current**: `useLocalSearchParams`, keyboard listeners, `KeyboardAvoidingView`, header menu toggles.
- **Keep**: only routing + wiring.
- **Extract**: UI sections into components (see below).

### B) Blocked users
- **Current**: an inline `useQuery(["blocks", currentUserId])` and then reused in comments filtering.
- **Extract**:
  - Replace with existing `useBlocks()` hook (already used elsewhere), or create `useBlocksQuery(userId)`.
  - The screen should just consume `blocks: string[]`.

### C) Post detail (from `posts_summary_view`)
- **Current**: `useQuery<any>({ queryKey: ["post", postId], ... from posts_summary_view })`
- **Extract**:
  - `usePostSummary(postId)` returning a typed row.
  - Create a shared view type:
    - `PostsSummaryViewRow` in `src/types/posts.ts` (also used by feed/profile/lostfound).

### D) Post author profile
- **Current**: `useQuery(["post-user", detailedPost?.user_id])`
- **Extract**:
  - `useProfileById(userId)` (generic hook/service reused in chat/profile etc.)

### E) Comments fetch + enrichment
- **Current**:
  - Fetch comments from `comments`
  - Fetch all authors from `profiles` via `.in("id", userIds)`
  - Fetch votes from `votes` via `.in("comment_id", commentIds)`
  - Compute `scoreByCommentId`
  - Map into `CommentWithReplies` shape
- **Extract**:
  - Data layer functions:
    - `fetchComments(postId): Promise<Comment[]>`
    - `fetchProfilesByIds(ids: string[]): Promise<Profile[]>`
    - `fetchCommentVotes(commentIds: string[]): Promise<{comment_id: string; vote_type: ...}[]>`
  - Hook:
    - `usePostComments(postId, viewerId, blocks)` that returns enriched flat list:
      - `CommentVM[]` where `user?: Profile`, `score: number`, `replies: never[]` (tree happens separately)

### F) Tree building (flat → nested)
- **Current**: `nestedComments` `useMemo` builds a map and roots.
- **Extract**:
  - Pure function `buildCommentTree(flat: CommentVM[]): CommentNode[]`
  - Keep it in `src/features/comments/tree.ts` or `src/utils/commentsTree.ts`
  - The hook `usePostComments` can return both `flat` and `tree`, but keep the tree builder pure.

### G) Comment composer + optimistic insert
- **Current**: `createCommentMutation` calls Edge Function `create-comment`, then merges into cache and scrolls.
- **Extract**:
  - `useCreateComment({ postId, viewerId })`
    - handles:
      - payload preparation
      - auth token retrieval
      - calling edge function
      - optimistic insert / cache merge
      - error normalization + user-facing messages
  - UI component `CommentComposer`:
    - props: `value`, `onChange`, `onSubmit`, `isAnonymousMode`, `replyContext`, etc.

### H) Post actions: bookmark, delete, report, block
- **Current**: multiple `useMutation` blocks + UI state for menus/modals.
- **Extract**:
  - `useBookmarkToggle(postId, viewerId)`
  - `useDeletePost(postId)`
  - `useReportPost(postId, viewerId)`
  - `useBlockUser(viewerId)`
  - UI components:
    - `PostOverflowMenu`
    - `ReportModal`/`BlockUserModal` remain but should be triggered from a thin controller hook `usePostModals()`.

---

## Proposed component split (UI)

### `PostDetailScreen` (keeps the route)
Renders:
- `PostHeaderCard` (uses `PostListItem` or a specialized `PostDetailHeader`)
- `CommentsTreeList`
- `CommentComposer`
- `PostModals` (report/block)

### `CommentsTreeList`
- Owns the `FlatList` for `nestedComments`
- Accepts:
  - `data: CommentNode[]`
  - `onReply(commentId)`
  - `onDeleteStart/onDeleteEnd`
- Uses `CommentListItem` internally.

### `PostHeaderCard`
If you keep `PostListItem`, change its API to accept a single `post` view-model to avoid the huge prop list.

---

## Cut sequence (safe, incremental)

### Cut 1: Centralize types (unblocks others)
- Create `src/types/posts.ts` exporting `PostsSummaryViewRow` (used by feed/profile/lostfound/post detail).
- Replace `useQuery<any>` with `useQuery<PostsSummaryViewRow | null>`.

### Cut 2: Extract pure helpers
- `buildCommentTree(flatComments)` as a pure function.
- `computeScores(votes)` helper.

### Cut 3: Extract comments hook
- `usePostComments(postId, viewerId, blocks)` returns:
  - `flatComments`, `treeComments`, `isLoading`, `refetch`

### Cut 4: Extract create-comment flow
- `useCreateComment({ postId, viewerId })` encapsulating edge function + cache merge.
- Screen just calls `createComment({ content, parentId, isAnonymous })`.

### Cut 5: Extract post actions
- Bookmark toggle + delete/report/block to separate hooks.
- Screen becomes menu wiring only.

### Cut 6: Split UI components
- Introduce `CommentsTreeList` and `CommentComposer`.
- Keep screen under ~200 lines.

---

## Risks / test checklist (do these during refactor)
- **Reply-to-reply**: ensure parent IDs never use `temp-` IDs (you already guard this).
- **Blocked users**: comments must filter correctly both in flat and nested view.
- **Cache merge correctness**: optimistic/new comments appear immediately and in the correct place.
- **Scroll behavior**: after posting, list scrolls to end only when appropriate (avoid jump when replying deep).
- **Bookmark state**: stays consistent between post detail and feed caches.

