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
};
