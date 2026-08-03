import AsyncStorage from "@react-native-async-storage/async-storage";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PostsSummaryViewRow } from "../types/posts";

type PostSummary = PostsSummaryViewRow;

// Versioned keys so a schema change can bust old cached blobs by bumping the suffix.
// Scoped per university — the live query key (["posts","lost_found",universityId])
// is university-scoped, so the storage key must be too, or a university switch
// (or a shared/reused device) could seed one university's posts under a key a
// different university's session would read.
const LF_KEY_PREFIX = "@unitee:lostfound_v1:";
// Campus Feed's default ("hot") tab only — see saveCampusFeedToStorage below
// for why this exists despite a prior removal of Campus Feed persistence.
const CAMPUS_FEED_KEY_PREFIX = "@unitee:campus_feed_hot_v1:";
// Single most-recently-viewed community's "hot" feed — see
// saveCommunityFeedToStorage below.
const COMMUNITY_FEED_KEY_PREFIX = "@unitee:community_feed_hot_v1:";
// Bumped v2 -> v3: pre-anonymity-fix caches could hold unredacted partner
// ids/participant fields for anonymous chats (fetched before chats_view /
// chat_messages_view existed). Bumping orphans that old data rather than
// risking it being read back and displayed/used after the fix ships.
const CHAT_KEY_PREFIX = "@unitee:chat_v3:";
// Bumped v1 -> v2: same reason as CHAT_KEY_PREFIX above — pre-fix caches
// could hold real sender ids for anonymous chat messages.
const CHAT_MESSAGES_KEY_PREFIX = "@unitee:chat_messages_v2:";
const USER_POSTS_KEY_PREFIX = "@unitee:user_posts_v1:";
const USER_TOTAL_VOTES_KEY_PREFIX = "@unitee:total_votes_v1:";
// Poll data for a specific post — not university/user-scoped by storage key
// (see savePollToStorage below for why).
const POLL_KEY_PREFIX = "@unitee:poll_v1:";

// Only cache the first page — enough to eliminate the skeleton on cold start.
const MAX_CACHED = 15;
const MAX_CACHED_CHATS = 25;
// Cache the first page of messages for the N most-recently-active chats.
const MAX_CACHED_MESSAGES = 30;
const MAX_CHATS_TO_CACHE_MESSAGES = 5;

// ---------------------------------------------------------------------------
// Write helpers — called from tab components after a successful network fetch.
// ---------------------------------------------------------------------------

export async function saveUserPostsToStorage(
  userId: string,
  pages: PostSummary[][],
): Promise<void> {
  try {
    const slice = (pages[0] ?? []).slice(0, MAX_CACHED);
    if (slice.length === 0) return;
    await AsyncStorage.setItem(USER_POSTS_KEY_PREFIX + userId, JSON.stringify(slice));
  } catch {}
}

export async function seedUserPostsCacheFromStorage(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(USER_POSTS_KEY_PREFIX + userId);
    if (!raw) return;
    const posts: PostSummary[] = JSON.parse(raw);
    if (!posts.length) return;
    if (queryClient.getQueryData(["user-posts", userId])) return;
    const data: InfiniteData<PostSummary[]> = {
      pages: [posts],
      pageParams: [0],
    };
    // updatedAt:0 → immediately stale → background refetch fires on mount
    queryClient.setQueryData(["user-posts", userId], data, { updatedAt: 0 });
  } catch {}
}

export async function saveUserTotalVotesToStorage(
  userId: string,
  total: number,
): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_TOTAL_VOTES_KEY_PREFIX + userId, String(total));
  } catch {}
}

export async function seedUserTotalVotesCacheFromStorage(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(USER_TOTAL_VOTES_KEY_PREFIX + userId);
    if (raw === null) return;
    const total = parseInt(raw, 10);
    if (isNaN(total)) return;
    if (queryClient.getQueryData(["user-total-votes", userId]) !== undefined) return;
    queryClient.setQueryData(["user-total-votes", userId], total, { updatedAt: 0 });
  } catch {}
}

export async function saveLostFoundToStorage(
  universityId: string | null | undefined,
  pages: PostSummary[][],
): Promise<void> {
  if (!universityId) return;
  try {
    const slice = (pages[0] ?? []).slice(0, MAX_CACHED);
    if (slice.length === 0) return;
    await AsyncStorage.setItem(LF_KEY_PREFIX + universityId, JSON.stringify(slice));
  } catch {}
}

// ---------------------------------------------------------------------------
// Campus Feed (default "hot" tab) persistence.
//
// A Campus Feed AsyncStorage seed existed previously and was removed, on the
// reasoning that _layout.tsx's prefetchInitialData() already seeds the
// Campus Feed cache from a fresh network fetch, making a separate
// AsyncStorage round trip redundant (see git history / the old "Campus Feed
// persistence — removed" test in feedPersistence.test.ts).
//
// That reasoning doesn't hold in practice, traced exactly (Phase 7.1):
//   1. prefetchInitialData() only ever seeds the "new" filter's key — never
//      "hot". "hot" is FilterContext's actual default tab, so it was never
//      seeded by anything, ever, on cold start.
//   2. Even for "new", prefetchInitialData() runs in a fire-and-forget block
//      that starts AFTER the splash is told to hide — it races the UI rather
//      than guaranteeing data lands before mount, unlike a synchronous
//      AsyncStorage seed read before <Slot/> renders.
//
// Net effect: the default feed tab always showed a full skeleton on cold
// start, even for a returning user with recently-seen posts. This restores
// Campus Feed persistence, scoped to the "hot" filter only (the default tab
// — "new"/"top" and community feeds are unaffected, matching the smallest
// fix for the actual reported symptom). Same pattern as Lost & Found above:
// versioned per-university key, first page only, updatedAt:0 on seed so the
// screen mounts with data (no skeleton) and silently refetches in the
// background.
// ---------------------------------------------------------------------------

export async function saveCampusFeedToStorage(
  universityId: string | null | undefined,
  pages: PostSummary[][],
): Promise<void> {
  if (!universityId) return;
  try {
    const slice = (pages[0] ?? []).slice(0, MAX_CACHED);
    if (slice.length === 0) return;
    await AsyncStorage.setItem(CAMPUS_FEED_KEY_PREFIX + universityId, JSON.stringify(slice));
  } catch {}
}

// A repost's poll (if it has one) belongs to the ORIGINAL post, not the
// repost's own post_id — Poll.tsx renders <Poll postId={repostedFromPostId}/>
// for reposts (PostListItem.tsx). Without including reposted_from_post_id
// here, a repost's poll was never in the seeded id list passed to
// seedPollCachesForPosts, so it still popped in after the repost itself
// rendered (Phase 7.2 fix).
function collectPollPostIds(posts: PostSummary[]): string[] {
  const ids = new Set<string>();
  for (const p of posts) {
    ids.add(p.post_id);
    if (p.reposted_from_post_id) {
      ids.add(p.reposted_from_post_id);
    }
  }
  return Array.from(ids);
}

// Must match useFeedPosts' live key exactly: feedKeys.list("hot", "", universityId, null)
// => ["posts", "feed", "hot", "", universityId, null].
//
// Returns the seeded (or already-cached) page's post ids (including, for
// reposts, the original post's id — see collectPollPostIds above) —
// _layout.tsx uses this to also seed any of those posts' poll data (see
// seedPollCachesForPosts below), since posts_summary_view carries no
// has-a-poll flag to check ahead of time.
export async function seedCampusFeedCacheFromStorage(
  queryClient: QueryClient,
  universityId: string | null | undefined,
): Promise<string[]> {
  if (!universityId) return [];
  try {
    const key = ["posts", "feed", "hot", "", universityId, null];
    const existing = queryClient.getQueryData<InfiniteData<PostSummary[]>>(key);
    if (existing) {
      return collectPollPostIds(existing.pages[0] ?? []);
    }

    const raw = await AsyncStorage.getItem(CAMPUS_FEED_KEY_PREFIX + universityId);
    if (!raw) return [];
    const posts: PostSummary[] = JSON.parse(raw);
    if (!posts.length) return [];
    const data: InfiniteData<PostSummary[]> = {
      pages: [posts],
      pageParams: [0],
    };
    queryClient.setQueryData(key, data, { updatedAt: 0 });
    return collectPollPostIds(posts);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Community feed ("hot" tab) persistence — same cold-start gap as Campus
// Feed, reported separately: opening a community after a cold start showed
// the same skeleton-then-pop-in, since community feeds were never persisted
// at all (deliberately session-only — see the note further down).
//
// Unlike Campus Feed (one fixed key) or Lost & Found (one entry per
// university), a user can belong to many communities, and there's no
// "default" community the way Campus/hot is the default feed tab — the app
// always opens to Campus regardless. Persisting every joined community would
// be unbounded storage growth for a benefit most of them never see (the user
// has to manually revisit each one). Scoped instead to the single
// MOST-RECENTLY-VIEWED community (whichever one was last successfully
// fetched, at the "hot" filter — the shared FilterContext selection every
// pane opens on): one bounded key per university, storing which community it
// is alongside its posts, so that if/when the user taps back into that same
// community after a cold start, its cache is already seeded and waiting —
// without changing which pane the app opens to by default.
// ---------------------------------------------------------------------------

type StoredCommunityFeedBlob = {
  communityId: string;
  posts: PostSummary[];
};

export async function saveCommunityFeedToStorage(
  universityId: string | null | undefined,
  communityId: string,
  pages: PostSummary[][],
): Promise<void> {
  if (!universityId || !communityId) return;
  try {
    const slice = (pages[0] ?? []).slice(0, MAX_CACHED);
    if (slice.length === 0) return;
    const blob: StoredCommunityFeedBlob = { communityId, posts: slice };
    await AsyncStorage.setItem(COMMUNITY_FEED_KEY_PREFIX + universityId, JSON.stringify(blob));
  } catch {}
}

// Must match useFeedPosts' live key exactly:
// feedKeys.list("hot", "", universityId, communityId)
// => ["posts", "feed", "hot", "", universityId, communityId].
//
// Returns the seeded (or already-cached) page's post ids, same reason as
// seedCampusFeedCacheFromStorage — so its posts' polls can be seeded too.
export async function seedCommunityFeedCacheFromStorage(
  queryClient: QueryClient,
  universityId: string | null | undefined,
): Promise<string[]> {
  if (!universityId) return [];
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_FEED_KEY_PREFIX + universityId);
    if (!raw) return [];
    const blob: StoredCommunityFeedBlob = JSON.parse(raw);
    if (!blob.communityId || !blob.posts?.length) return [];

    const key = ["posts", "feed", "hot", "", universityId, blob.communityId];
    const existing = queryClient.getQueryData<InfiniteData<PostSummary[]>>(key);
    if (existing) {
      return collectPollPostIds(existing.pages[0] ?? []);
    }

    const data: InfiniteData<PostSummary[]> = {
      pages: [blob.posts],
      pageParams: [0],
    };
    queryClient.setQueryData(key, data, { updatedAt: 0 });
    return collectPollPostIds(blob.posts);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Poll persistence — closes the same cold-start pop-in gap as the Campus
// Feed seed above, but for polls specifically.
//
// Poll.tsx runs its own independent useQuery (["poll", postId, userId]),
// entirely unseeded by the feed-list fix — so even once a post's own row
// renders immediately from the seeded feed cache, a post with a poll still
// rendered nothing (Poll.tsx returns null while isLoading) until its own
// network fetch resolved, then popped in. Not university-scoped (a poll
// isn't a university-scoped resource) — keyed purely by postId, since a
// stale-but-present snapshot is corrected within moments either way
// (updatedAt: 0 below triggers the same silent background refetch as every
// other seed in this file).
// ---------------------------------------------------------------------------

export async function savePollToStorage(
  postId: string,
  pollData: unknown,
): Promise<void> {
  try {
    await AsyncStorage.setItem(POLL_KEY_PREFIX + postId, JSON.stringify(pollData));
  } catch {}
}

// Seeds ["poll", postId, userId] for whichever of the given post ids have a
// previously-saved poll snapshot. Called from _layout.tsx right after the
// Campus Feed seed, using that seed's own post ids. A post with no poll
// simply has no stored blob and is silently skipped — Poll.tsx already
// renders null for those regardless, so there's nothing to seed.
export async function seedPollCachesForPosts(
  queryClient: QueryClient,
  postIds: string[],
  userId: string | undefined,
): Promise<void> {
  if (!userId || postIds.length === 0) return;
  await Promise.all(
    postIds.map(async (postId) => {
      try {
        const raw = await AsyncStorage.getItem(POLL_KEY_PREFIX + postId);
        if (!raw) return;
        const poll = JSON.parse(raw);
        const key = ["poll", postId, userId];
        if (queryClient.getQueryData(key)) return;
        queryClient.setQueryData(key, poll, { updatedAt: 0 });
      } catch {}
    }),
  );
}

// ---------------------------------------------------------------------------
// Chat list persistence — summaries + participant profiles.
//
// participantIds are ALWAYS stored and used sorted so the React Query key
// ["chat-users", participantIds] is identical between the stored snapshot and
// the freshly-computed array in chat.tsx. A mismatch in array order would
// cause a cache miss even though the data was already seeded, resulting in the
// "Unknown User" flicker.
// ---------------------------------------------------------------------------

type StoredChatBlob = {
  summaries: Record<string, unknown>[];
  users: Record<string, unknown>[];
  participantIds: string[]; // always sorted
};

export async function saveChatToStorage(
  userId: string,
  summaries: Record<string, unknown>[],
  users: Record<string, unknown>[],
  participantIds: string[],
): Promise<void> {
  try {
    const slice = summaries.slice(0, MAX_CACHED_CHATS);
    if (slice.length === 0) return;
    // Sort so the stored key is order-stable.
    const sortedIds = [...participantIds].sort();
    const blob: StoredChatBlob = { summaries: slice, users, participantIds: sortedIds };
    await AsyncStorage.setItem(CHAT_KEY_PREFIX + userId, JSON.stringify(blob));
  } catch {}
}

export async function seedChatCacheFromStorage(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_KEY_PREFIX + userId);
    if (!raw) return;
    const blob: StoredChatBlob = JSON.parse(raw);
    if (!blob.summaries?.length) return;

    if (!queryClient.getQueryData(["chat-summaries", userId])) {
      queryClient.setQueryData(
        ["chat-summaries", userId],
        blob.summaries,
        { updatedAt: 0 },
      );
    }

    if (blob.participantIds?.length && blob.users?.length) {
      // Sort again defensively — ensures the key matches even if an older blob
      // was stored before we added the sort in saveChatToStorage.
      const sortedIds = [...blob.participantIds].sort();
      if (!queryClient.getQueryData(["chat-users", sortedIds])) {
        queryClient.setQueryData(
          ["chat-users", sortedIds],
          blob.users,
          { updatedAt: 0 },
        );
      }
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Chat message persistence — first page of messages for recently active chats.
//
// Storing messages means:
//  1. ChatDetailSkeleton never shows on cold start (data is already in cache).
//  2. image_url paths are available synchronously → expo-image serves the
//     thumbnail from disk without a network round-trip.
// ---------------------------------------------------------------------------

export async function saveChatMessagesToStorage(
  chatId: string,
  messages: Record<string, unknown>[],
): Promise<void> {
  try {
    const slice = messages.slice(0, MAX_CACHED_MESSAGES);
    if (slice.length === 0) return;
    await AsyncStorage.setItem(
      CHAT_MESSAGES_KEY_PREFIX + chatId,
      JSON.stringify(slice),
    );
  } catch {}
}

// Reads the stored chat summaries to discover recent chat IDs, then seeds the
// messages cache for each. Called from _layout.tsx before <Slot /> renders.
export async function seedChatMessagesCacheFromStorage(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  try {
    const chatRaw = await AsyncStorage.getItem(CHAT_KEY_PREFIX + userId);
    if (!chatRaw) return;
    const blob: StoredChatBlob = JSON.parse(chatRaw);
    if (!blob.summaries?.length) return;

    // Only seed the most-recently-active chats to keep startup fast.
    const topChatIds = (blob.summaries as any[])
      .slice(0, MAX_CHATS_TO_CACHE_MESSAGES)
      .map((s: any) => s.chat_id as string)
      .filter(Boolean);

    await Promise.all(
      topChatIds.map(async (chatId) => {
        try {
          const raw = await AsyncStorage.getItem(CHAT_MESSAGES_KEY_PREFIX + chatId);
          if (!raw) return;
          const messages: Record<string, unknown>[] = JSON.parse(raw);
          if (!messages.length) return;
          if (queryClient.getQueryData(["chat-messages", chatId])) return;
          const data: InfiniteData<Record<string, unknown>[]> = {
            pages: [messages],
            pageParams: [0],
          };
          queryClient.setQueryData(["chat-messages", chatId], data, { updatedAt: 0 });
        } catch {}
      }),
    );
  } catch {}
}

// ---------------------------------------------------------------------------
// Lost & Found seed helper — called from _layout.tsx before <Slot /> renders.
//
// Seeds ["posts","lost_found",universityId] — must match lostfound.tsx's live
// query key exactly, and universityId must be known before this runs (it's
// read from AuthContext's cachedProfile, itself persisted across cold starts —
// see university_id on CachedProfile). If universityId isn't known yet (a
// brand-new login with no prior cached profile), this is a no-op: there is
// nothing meaningful to seed under a university-scoped key without one, and
// the screen will simply load normally from the network, same as any first
// visit.
//
// Campus Feed's "hot" tab is now persisted too — see
// saveCampusFeedToStorage/seedCampusFeedCacheFromStorage above (Phase 7.1).
// The single most-recently-viewed community's "hot" feed is persisted the
// same way — see saveCommunityFeedToStorage/seedCommunityFeedCacheFromStorage
// above (Phase 7.1 follow-up). Every other joined community not seeded this
// way still relies on the in-memory React Query cache within a session,
// same as before.
//
// The seeded entry is stamped with updatedAt = 0 so it is immediately
// considered stale: the screen mounts with data (no skeleton) and
// automatically triggers a background refetch in the same tick.
// ---------------------------------------------------------------------------

export async function seedLostFoundCacheFromStorage(
  queryClient: QueryClient,
  universityId: string | null | undefined,
): Promise<void> {
  if (!universityId) return;
  try {
    const raw = await AsyncStorage.getItem(LF_KEY_PREFIX + universityId);
    if (!raw) return;
    const posts: PostSummary[] = JSON.parse(raw);
    if (!posts.length) return;
    if (queryClient.getQueryData(["posts", "lost_found", universityId])) return;
    const data: InfiniteData<PostSummary[]> = {
      pages: [posts],
      pageParams: [0],
    };
    queryClient.setQueryData(["posts", "lost_found", universityId], data, {
      updatedAt: 0,
    });
  } catch {}
}
