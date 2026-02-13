import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";
import { buildCommentTree, CommentVM, CommentNode } from "../utils/tree";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Vote = Database["public"]["Tables"]["votes"]["Row"];

async function fetchCommentsWithMeta(
  postId: string
): Promise<CommentVM[]> {
  if (!postId) return [];

  const { data: comments, error: commentsErr } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (commentsErr) throw commentsErr;
  if (!comments?.length) return [];

  const userIds = [
    ...new Set(comments.map((c) => c.user_id).filter(Boolean)),
  ] as string[];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds);

  const usersById = new Map<string, Profile>(
    (profiles || []).map((u) => [u.id, u])
  );

  const commentIds = comments.map((c) => c.id);
  const { data: votes } = await supabase
    .from("votes")
    .select("comment_id, vote_type")
    .in("comment_id", commentIds);

  const scoreByCommentId = new Map<string, number>();
  (votes || []).forEach((vote) => {
    const id = vote.comment_id;
    if (!id) return;
    const current = scoreByCommentId.get(id) || 0;
    const delta = vote.vote_type === "upvote" ? 1 : -1;
    scoreByCommentId.set(id, current + delta);
  });

  return comments.map((c) => ({
    ...c,
    user: c.user_id ? usersById.get(c.user_id) : undefined,
    score: scoreByCommentId.get(c.id) || 0,
  }));
}

export function usePostComments(
  postId: string | null | undefined,
  viewerId: string | null,
  blockedUserIds: string[]
): {
  flatComments: CommentVM[];
  treeComments: CommentNode[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  isRefetching: boolean;
} {
  const {
    data: flatComments = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<CommentVM[]>({
    queryKey: ["comments", postId, viewerId],
    enabled: Boolean(postId),
    queryFn: async () => {
      if (!postId) return [];
      return fetchCommentsWithMeta(postId);
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 15,
    retry: 2,
  });

  const treeComments = buildCommentTree(flatComments, blockedUserIds);

  return {
    flatComments,
    treeComments,
    isLoading,
    error,
    refetch,
    isRefetching,
  };
}

