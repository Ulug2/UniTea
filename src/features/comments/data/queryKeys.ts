/**
 * Query key factory for comments — use for every read, write, optimistic
 * update and invalidation so cache entries always align.
 */
export const commentKeys = {
  all: ["comments"] as const,
  /** Every viewer's cached comment list for one post. */
  post: (postId: string | null | undefined) => ["comments", postId] as const,
  /** One viewer's comment list for one post (flat CommentVM[]). */
  list: (postId: string | null | undefined, viewerId: string | null | undefined) =>
    ["comments", postId, viewerId] as const,
};
