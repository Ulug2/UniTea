## Cut Plan: `src/app/(protected)/chat/[id].tsx` (Chat detail screen)

### Why this file needs a cut
- **Violates SRP (single responsibility)**: the screen currently owns data fetching, realtime subscriptions, optimistic UI, rate limiting, image picking/uploading, message actions (delete/report/block), gesture-driven fullscreen image viewer, and rendering/styling.
- **Hard to change safely**: lots of state + effects + mutation side effects in one module → regressions are easy.
- **Type safety leaks**: multiple `any` usages in gestures, cache updates, and Supabase payloads.

### Goals (what “done” looks like)
- **One screen file** that is mostly composition: grabs `id`, uses a few hooks, renders a few components.
- **Each concern extracted** into a hook/service/component with a clear API.
- **No `any` in new code**. Existing `any` in this file should be isolated behind typed adapters.
- **Behavior preserved**:
  - Infinite scroll pagination.
  - Smart realtime cache updates (no UI lag).
  - Optimistic sends with retry.
  - Rate limiting.
  - Block filtering.
  - Fullscreen pinch-to-zoom.
  - Delete for me / delete for everyone.
  - Notification suppression while viewing a chat.

---

## Current responsibilities (map → extraction target)

### A) Routing + shell layout
- **Current**: `useLocalSearchParams`, `useSafeAreaInsets`, `KeyboardAvoidingView`, header/menu wiring.
- **Keep in screen**: minimal glue only.
- **Extract**: UI into `ChatHeader`, `ChatComposer`, `ChatMessageList`.

### B) Chat + other user identity
- **Current**: `useQuery(["chat", id])`, compute `otherUserId`, anonymous detection + deterministic anon display name.
- **Extract**:
  - `useChatThread(chatId)` → returns `{ chat, otherUserId, isAnonymousThread }`
  - `useChatParticipant(otherUserId, isAnonymous)` → returns `{ otherUser, displayName, avatarSource }`
  - Move `hashStringToNumber()` to `src/utils/anon.ts` (or `src/features/chat/utils/anon.ts`).

### C) Messages query (infinite) + flatten/filter
- **Current**: `useInfiniteQuery(["chat-messages", id])` with paging, then `useMemo` to flatten and filter blocked users.
- **Extract**:
  - `useChatMessagesInfinite(chatId, { pageSize })`
    - returns `{ messages, query }`
    - owns `MESSAGES_PER_PAGE` (or accepts it)
  - `selectMessages(messagesData, blocks)` helper.

### D) Realtime subscription (INSERT) with cache update + de-dupe
- **Current**: `useEffect` creating `supabase.channel("chat-${id}")`, tracks `pendingMessageIds`, writes into React Query infinite cache with full new references.
- **Extract**:
  - `useChatMessagesRealtime(chatId, currentUserId, queryClient, { pendingMessageIdsRef })`
  - Or split:
    - `subscribeToChatMessages(chatId, onInsert)` in `src/features/chat/data/realtime.ts`
    - `applyInsertedMessageToInfiniteCache(queryClient, chatId, newMessage)` in `src/features/chat/data/cache.ts`
- **Key API contract**:
  - Must **ignore** self messages (already optimistic).
  - Must **dedupe** messages (cache + pending set).
  - Must update cache in the same queryKey shape (`pages`, `pageParams`).

### E) Optimistic send + retry + rate limiting + image upload
- **Current**: `sendMessageMutation`, `handleSend`, `pickImage`, optimistic image uri map, sendStatus flagging, multiple rate limit constants and refs.
- **Extract**:
  - `useChatSendMessage(chatId, currentUserId)`
    - inputs: `messageText`, `localImageUri?`
    - does: rate limit check, optional upload, optimistic insert, mutation call, rollback/mark failed, retry.
    - returns:
      - `send({ text, localImageUri })`
      - `retry(tempIdOrMessageId)`
      - `isSending`, `rateLimitState`
  - `useImagePicker()` or `pickChatImage()` helper that returns `{ localUri }` and centralizes permissions + cancel handling.
  - Keep actual upload in `src/utils/supabaseImages.ts` but isolate the call from UI with a small adapter:
    - `uploadChatImage(localUri): Promise<string /*path*/>`

### F) Message actions (long-press menu, delete, “delete for everyone”)
- **Current**: action sheet + `deleteMessageMutation` with onMutate cache edits; also uses `as any` for fields.
- **Extract**:
  - `useChatMessageActions(chatId, currentUserId)`
    - `deleteForMe(messageId)`
    - `deleteForEveryone(messageId)`
    - `openMessageActionSheet(message)`
  - `applyMessageDeletionToInfiniteCache(...)` helper.
- **Schema mismatch cleanup**:
  - The code currently sets `is_deleted: true as any` but also uses `deleted_by_sender/receiver`.
  - Create **one canonical “deleted state” view-model** in chat feature:
    - `isDeletedForViewer(message, viewerId): boolean`
    - `deletedLabel(message): string` (e.g. “This message was deleted”)
  - This avoids sprinkling `as any` updates.

### G) Fullscreen image viewer (Modal + pan/pinch)
- **Current**: `fullScreenImagePath`, animated values, `PanResponder`, `Modal`.
- **Extract**:
  - `usePinchZoom()` hook returning `{ panResponder, animatedStyle, reset }`
  - `FullscreenImageModal` component receiving:
    - `visible`, `imagePath`, `onClose`
    - `pinchZoom` controls from `usePinchZoom`

### H) Scroll-to-bottom behavior + “new messages” badge
- **Current**: `flatListRef`, `isAtBottom`, `pendingNewMessages`, scroll handlers.
- **Extract**:
  - `useChatAutoScroll(flatListRef)`
    - `onScroll`, `scrollToBottom`, `isAtBottom`, `pendingNewCount`, `clearPending()`
  - Keep `FlatList` wiring in `ChatMessageList`.

### I) Styling
- **Current**: multiple `StyleSheet.create` blocks including dynamic styles.
- **Extract**:
  - `chatDetail.styles.ts` exporting `makeChatDetailStyles(theme, isDark)` and static `styles`.

---

## Proposed target structure (recommended)

```text
src/features/chat/
  chatDetail/
    ChatDetailScreen.tsx               // thin composer (optional move later)
    components/
      ChatHeader.tsx
      ChatMessageList.tsx
      ChatComposer.tsx
      FullscreenImageModal.tsx
      MessageBubble.tsx
    hooks/
      useChatThread.ts
      useChatParticipant.ts
      useChatMessagesInfinite.ts
      useChatMessagesRealtime.ts
      useChatSendMessage.ts
      useChatMessageActions.ts
      useChatAutoScroll.ts
      usePinchZoom.ts
    data/
      queries.ts                       // fetchChat, fetchMessages, fetchParticipant
      realtime.ts                      // subscribeToChatMessages
      cache.ts                         // cache updaters for infinite query
    types.ts                           // ChatMessageVM, DeleteAction, etc
    styles.ts
```

If you don’t want a `features/` folder yet, mirror the same split under:
`src/app/(protected)/chat/_chatDetail/` and `src/components/chat/`.

---

## Cut sequence (safe, incremental)

### Cut 1: Extract pure helpers (zero behavior change)
- Move `hashStringToNumber` to a utility file.
- Add `types.ts` for:
  - `ChatMessageVM` (DB row + local fields)
  - `MessagesQueryData` (pages/pageParams)
  - `DeleteAction`
- Add cache helper signatures (implementation can be moved later):
  - `prependMessage(oldData, newMessage): MessagesQueryData`

### Cut 2: Extract Fullscreen image viewer
- Create `FullscreenImageModal` + `usePinchZoom`.
- Replace the inline modal/animated/pan responder block with the component.

### Cut 3: Extract messages query + flatten/filter
- Create `useChatMessagesInfinite(chatId)` returning `messagesData` + `messages`.
- Move the `blocks` filtering into a selector helper.

### Cut 4: Extract realtime subscription
- Create `useChatMessagesRealtime(chatId, currentUserId)` which only depends on queryClient and cache helpers.
- Keep the pending dedupe Set in the hook (or pass it in).

### Cut 5: Extract send pipeline
- Create `useChatSendMessage(chatId, currentUserId)` that owns:
  - rate limit tracking
  - optimistic insert/update in cache
  - upload image + mutation
  - retry logic
- Screen becomes a simple call to `send({ text, localImageUri })`.

### Cut 6: Extract message actions (long press + delete)
- Create `useChatMessageActions` and cache updaters.
- Remove `as any` from mutation payloads by isolating DB update details in the data layer.

### Cut 7: Split UI rendering
- Introduce `ChatHeader`, `ChatMessageList`, `ChatComposer`, `MessageBubble`.
- Screen file mostly wires them together.

---

## APIs to design up-front (so you don’t repaint later)

### `useChatSendMessage`
- Input: `{ text: string; localImageUri?: string | null }`
- Returns:
  - `send(payload): void`
  - `retry(messageIdOrTempId): void`
  - `isSending: boolean`
  - `pickImage(): Promise<void>` (optional) or keep picker in composer component

### Cache helper (infinite query)
- `addOptimisticMessage(queryClient, chatId, optimisticMessage): void`
- `replaceOptimisticMessage(queryClient, chatId, tempId, confirmedMessage): void`
- `markMessageFailed(queryClient, chatId, tempId, error): void`
- `prependIncomingMessage(queryClient, chatId, newMessage): void`

---

## Known risky areas (test these first during the refactor)
- **Realtime + optimistic dedupe**: ensure your own message doesn’t appear twice.
- **Pagination correctness**: new inserts should go to page 0, old pages remain stable.
- **Delete semantics**: “delete for me” should hide only for current viewer; “for everyone” should show tombstone consistently.
- **Scroll behavior**: new message auto-scroll only when user is at bottom; otherwise increment badge.
- **Fullscreen modal gestures**: ensure it doesn’t block the main list gestures.

