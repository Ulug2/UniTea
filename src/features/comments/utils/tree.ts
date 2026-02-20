import type { Database } from "../../../types/database.types";

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
  blockedUserIds: string[] = []
): CommentNode[] {
  if (!flatComments.length) return [];

  const filtered = flatComments.filter(
    (c) => c.user_id && !blockedUserIds.includes(c.user_id)
  );

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

