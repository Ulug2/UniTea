// Single source of truth for React Query cache keys.
//
// Building keys here (instead of inline string arrays scattered across
// screens) guarantees that reads, writes, optimistic updates, and
// invalidations always target the exact same cache entry.

export const communityKeys = {
  all: ["communities"] as const,
  mine: (userId: string | undefined) =>
    [...communityKeys.all, "mine", userId] as const,
  directory: (universityId: string | undefined) =>
    [...communityKeys.all, "directory", universityId] as const,
  detail: (communityId: string | undefined) =>
    [...communityKeys.all, "detail", communityId] as const,
};

export const feedKeys = {
  all: ["posts", "feed"] as const,
  /**
   * Per-filter, per-community feed page. `communityId` is part of the key so
   * each community (and the Campus Feed, communityId === null) caches
   * independently and switching between them is instant.
   */
  list: (
    filter: string,
    activeSearchQuery: string,
    universityId: string | undefined,
    communityId: string | null,
  ) =>
    [
      ...feedKeys.all,
      filter,
      activeSearchQuery,
      universityId,
      communityId,
    ] as const,
  /**
   * Predicate matching every cached `list()` entry (any filter, any search
   * text, any university) for exactly one community — or the Campus Feed
   * when `communityId` is null. Use with `queryClient.invalidateQueries({
   * predicate })` so an interaction inside one feed (posting, bookmarking,
   * etc.) never invalidates — and forces a refetch of — any other
   * community's or Campus's cache. communityId is always the last element
   * of a `list()` key.
   */
  belongsToCommunity:
    (communityId: string | null) =>
    (query: { queryKey: readonly unknown[] }) => {
      const key = query.queryKey;
      return (
        key[0] === "posts" &&
        key[1] === "feed" &&
        key.length === 6 &&
        key[5] === communityId
      );
    },
};
