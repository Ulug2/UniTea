import AsyncStorage from "@react-native-async-storage/async-storage";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PostsSummaryViewRow } from "../types/posts";

type PostSummary = PostsSummaryViewRow;

// Versioned keys so a schema change can bust old cached blobs by bumping the suffix.
const FEED_KEY_PREFIX = "@unitee:feed_v1:";
const LF_KEY = "@unitee:lostfound_v1";

// Only cache the first page — enough to eliminate the skeleton on cold start.
const MAX_CACHED = 15;

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
// Seed helper — called from _layout.tsx before the splash screen hides.
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
