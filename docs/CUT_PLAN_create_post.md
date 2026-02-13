## Cut Plan: `src/app/(protected)/create-post.tsx` (Create post / repost / poll / lost&found)

### Why this file needs a cut
- **SRP violation**: post form state, validation, image picking + manipulation, uploads, repost preview, poll editor, lost&found fields, edge-function call, optimistic updates, and navigation/reset are all in one file.
- **Hard to reason about**: multiple “modes” in one screen (`feed` vs `lost_found`, repost vs original, poll vs non-poll).
- **Magic constants** for image sizing/compression scattered in UI logic.

### Goals (definition of done)
- A thin screen that composes:
  - `CreatePostForm` (UI)
  - `useCreatePostFormState` (state + validation)
  - `useCreatePost` (mutation + optimistic updates)
  - `useImagePipeline` (pick → manipulate → upload)
- Clean separation between:
  - **Form state** (what user typed)
  - **Domain payload** (what you send to edge function)
  - **Optimistic cache updates** (React Query)

---

## Current responsibilities → extraction targets

### A) Navigation + reset (`goBack`)
- **Current**: resets many pieces of state and does `router.replace`.
- **Extract**:
  - `useCreatePostNavigation()` returning `{ closeAndReset() }`
  - Or keep in screen but only call `resetForm()` from the form-state hook.

### B) Form state for multiple modes
- **Current**: `content`, `image`, `isAnonymous`, `isPoll`, `pollOptions`, `category`, `location`.
- **Extract**:
  - `useCreatePostFormState({ type, repostId })`
    - returns state + setters + `reset()`
    - derives booleans: `isLostFound`, `isRepost`
    - provides `canSubmit`, `validationErrors`

### C) Image pipeline (pick + manipulate)
- **Current**: `pickImage()` uses ImagePicker + ImageManipulator with inline constants (1080 width, 0.7 compress, WEBP).
- **Extract**:
  - `useImagePipeline({ maxWidth, compress, format })`
    - `pickAndPrepareImage(): Promise<{ localUri: string } | null>`
  - Put constants in one place:
    - `src/config/images.ts` (or `src/constants/imagesProcessing.ts`)

### D) Original post fetch (repost preview)
- **Current**: `useQuery(["original-post", repostId])` inside screen.
- **Extract**:
  - `useOriginalPostForRepost(repostId)` returning typed `PostsSummaryViewRow | null`.
  - This also pushes you to centralize the `posts_summary_view` type in `src/types/posts.ts`.

### E) Create-post mutation (edge function) + optimistic cache update
- **Current**: `useMutation` holds:
  - payload building (including poll options)
  - auth token retrieval
  - fetch call to edge function `create-post`
  - optimistic update for feed posts
  - cache invalidations for lost&found/feed
- **Extract**:
  - `useCreatePostMutation({ isLostFound, isRepost })`
    - Input: `CreatePostInput` (typed)
    - Output: `createPost(input)` + `isPending`
  - Data layer:
    - `createPostViaEdgeFunction(payload, accessToken): Promise<PostRow>`
  - Cache helper:
    - `applyOptimisticNewPost(queryClient, postVM)`
    - `replaceOptimisticPost(queryClient, tempId, createdPost)`

### F) Poll editor UI
- **Current**: poll state and UI are interleaved with the rest of the form.
- **Extract**:
  - `PollEditor` component (controlled):
    - props: `enabled`, `options`, `onOptionsChange`, `onRemove`
  - Pure validation helper:
    - `validatePollOptions(options): { ok: boolean; cleaned: string[]; error?: string }`

### G) Lost & Found fields UI
- **Extract**:
  - `LostFoundFields` component:
    - `category`, `location`, `onCategoryChange`, `onLocationChange`

### H) Repost preview UI
- **Extract**:
  - `RepostPreview` component consuming `originalPost` and rendering author/content/image.

---

## Proposed target structure

```text
src/features/posts/create/
  CreatePostScreen.tsx                // thin route screen (optional move later)
  components/
    CreatePostForm.tsx
    PollEditor.tsx
    LostFoundFields.tsx
    RepostPreview.tsx
    ImagePickerField.tsx
  hooks/
    useCreatePostFormState.ts
    useImagePipeline.ts
    useOriginalPostForRepost.ts
    useCreatePostMutation.ts
  data/
    edge.ts                           // createPostViaEdgeFunction
    cache.ts                          // optimistic cache helpers
  types.ts                            // CreatePostInput, CreatePostPayload, etc.
src/config/images.ts
src/types/posts.ts
```

---

## Cut sequence (safe, incremental)

### Cut 1: Centralize view type + original post hook
- Create `src/types/posts.ts` and type the `posts_summary_view` row.
- Extract `useOriginalPostForRepost(repostId)`.

### Cut 2: Extract image pipeline
- Create `useImagePipeline` + `config/images.ts`.
- Screen calls `pickAndPrepareImage()` and sets `image` state.

### Cut 3: Extract poll editor + validation
- Move poll UI to `PollEditor`.
- Add `validatePollOptions` helper and use it in submit handler.

### Cut 4: Extract form state hook
- `useCreatePostFormState` owns state and derived flags.
- Screen becomes “wire UI → state”.

### Cut 5: Extract mutation + cache helpers
- `useCreatePostMutation` owns edge call + optimistic updates + invalidations.
- Screen calls `createPost(...)` and navigates/cleans up on success.

### Cut 6: Split remaining UI into components
- `LostFoundFields`, `RepostPreview`, `ImagePickerField`, `CreatePostForm`.
- Keep screen under ~200–250 lines.

---

## Risks / test checklist
- Repost: allow empty content; ensure payload sets `reposted_from_post_id` and `repost_comment` correctly.
- Poll: validate distinct options; ensure poll payload is only sent for feed posts.
- Image: cancellation path, manipulator errors, upload failures, and memory usage.
- Optimistic feed insertion: ensure it doesn’t break pagination / dedupe in feed query.

