import type { Database } from "../../../types/database.types";
import type { BlockRecord } from "../../../hooks/useBlocks";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type CommentVM = Comment & {
  user: Profile | undefined;
  score: number;
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
    if (!c.user_id) return true;
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

