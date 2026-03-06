import AsyncStorage from "@react-native-async-storage/async-storage";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PostsSummaryViewRow } from "../types/posts";

type PostSummary = PostsSummaryViewRow;

// Versioned keys so a schema change can bust old cached blobs by bumping the suffix.
const FEED_KEY_PREFIX = "@unitee:feed_v1:";
const LF_KEY = "@unitee:lostfound_v1";
const CHAT_KEY_PREFIX = "@unitee:chat_v1:";
const USER_POSTS_KEY_PREFIX = "@unitee:user_posts_v1:";
const USER_TOTAL_VOTES_KEY_PREFIX = "@unitee:total_votes_v1:";

// Only cache the first page — enough to eliminate the skeleton on cold start.
const MAX_CACHED = 15;
const MAX_CACHED_CHATS = 25;

// ---------------------------------------------------------------------------
// Write helpers — called from tab components after a successful network fetch.
// ---------------------------------------------------------------------------

export async function saveFeedToStorage(
  filter: string,
  pages: PostSummary[][],
): Promise<void> {
  try {
    const slice = (pages[0] ?? []).slice(0, MAX_CACHED);
    if (slice.length === 0) return;
    await AsyncStorage.setItem(FEED_KEY_PREFIX + filter, JSON.stringify(slice));
  } catch {
    // Non-fatal — a failed write just means no cache on next cold start.
  }
}

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
  pages: PostSummary[][],
): Promise<void> {
  try {
    const slice = (pages[0] ?? []).slice(0, MAX_CACHED);
    if (slice.length === 0) return;
    await AsyncStorage.setItem(LF_KEY, JSON.stringify(slice));
  } catch {}
}

// ---------------------------------------------------------------------------
// Chat persistence — chat summaries + participant user profiles.
// Stored as a single blob per user: { summaries, users, participantIds }.
// The participantIds array is stored so we can reconstruct the exact dynamic
// query key ["chat-users", participantIds] used by the chat tab.
// ---------------------------------------------------------------------------

type StoredChatBlob = {
  summaries: Record<string, unknown>[];
  users: Record<string, unknown>[];
  participantIds: string[];
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
    const blob: StoredChatBlob = { summaries: slice, users, participantIds };
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
      if (!queryClient.getQueryData(["chat-users", blob.participantIds])) {
        queryClient.setQueryData(
          ["chat-users", blob.participantIds],
          blob.users,
          { updatedAt: 0 },
        );
      }
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Feed + Lost&Found seed helper — called from _layout.tsx before <Slot /> renders.
//
// Reads every feed key from AsyncStorage in parallel and seeds the React Query
// cache with the results. Each entry is stamped with updatedAt = 0 so it is
// immediately considered stale: components mount with data (no skeleton) and
// automatically trigger a background refetch in the same tick.
// ---------------------------------------------------------------------------

export async function seedQueryCacheFromStorage(
  queryClient: QueryClient,
): Promise<void> {
  const filters = ["hot", "new", "top"] as const;

  await Promise.all([
    ...filters.map(async (filter) => {
      try {
        const raw = await AsyncStorage.getItem(FEED_KEY_PREFIX + filter);
        if (!raw) return;
        const posts: PostSummary[] = JSON.parse(raw);
        if (!posts.length) return;
        // Don't overwrite data that is already in the cache (e.g. "new" just
        // seeded by prefetchInitialData with fresh network data).
        if (queryClient.getQueryData(["posts", "feed", filter])) return;
        const data: InfiniteData<PostSummary[]> = {
          pages: [posts],
          pageParams: [0],
        };
        queryClient.setQueryData(["posts", "feed", filter], data, {
          // Epoch 0 → always stale → background refetch fires when the tab mounts.
          updatedAt: 0,
        });
      } catch {}
    }),
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LF_KEY);
        if (!raw) return;
        const posts: PostSummary[] = JSON.parse(raw);
        if (!posts.length) return;
        if (queryClient.getQueryData(["posts", "lost_found"])) return;
        const data: InfiniteData<PostSummary[]> = {
          pages: [posts],
          pageParams: [0],
        };
        queryClient.setQueryData(["posts", "lost_found"], data, {
          updatedAt: 0,
        });
      } catch {}
    })(),
  ]);
}
