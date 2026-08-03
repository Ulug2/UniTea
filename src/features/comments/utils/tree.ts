import type { Database } from "../../../types/database.types";
import type { BlockRecord } from "../../../hooks/useBlocks";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type CommentVM = Comment & {
  user: Profile | undefined;
  score: number;
  /**
   * Current viewer's own vote on this comment, aggregated server-side
   * alongside `score` in the same votes query (see usePostComments.ts's
   * fetchCommentsWithMeta) — seeds useVote so a comment's vote-arrow
   * highlight doesn't pop in after its score already shows (Phase 7.2).
   */
  user_vote: "upvote" | "downvote" | null;
  /**
   * Optional per-post anonymous id (User 1, User 2, ...)
   * Populated for anonymous comments when available.
   */
  post_specific_anon_id?: number | null;
};

export type CommentNode = CommentVM & {
  replies: CommentNode[];
};

export function buildCommentTree(
  flatComments: CommentVM[],
  blocks: BlockRecord[] = []
): CommentNode[] {
  if (!flatComments.length) return [];

  const filtered = flatComments.filter((c) => {
    if (!c.user_id) return false; // defensive: comments must have an author
    const isAnon = c.is_anonymous ?? false;
    return !blocks.some(
      (b) =>
        b.userId === c.user_id &&
        ((b.scope === "anonymous_only" && isAnon) ||
          (b.scope === "profile_only" && !isAnon))
    );
  });

  const commentMap: Record<string, CommentNode> = {};
  const roots: CommentNode[] = [];
  const addedToRoots = new Set<string>();

  filtered.forEach((c) => {
    commentMap[c.id] = { ...c, replies: [] };
  });

  filtered.forEach((c) => {
    if (c.parent_comment_id && commentMap[c.parent_comment_id]) {
      commentMap[c.parent_comment_id].replies.push(commentMap[c.id]);
    } else if (!addedToRoots.has(c.id)) {
      addedToRoots.add(c.id);
      roots.push(commentMap[c.id]);
    }
  });

  return roots;
}

