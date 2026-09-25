import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";
import { buildCommentTree, CommentVM, CommentNode } from "../utils/tree";
import type { BlockRecord } from "../../../hooks/useBlocks";
import { commentKeys } from "../data/queryKeys";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Vote = Database["public"]["Tables"]["votes"]["Row"];

async function fetchCommentsWithMeta(
  postId: string,
  viewerId: string | null,
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
  // Selecting user_id too (not just for the score aggregation) lets us also
  // pick out the viewer's own vote per comment from this same, already-
  // fetched result — no second query — so CommentListItem's useVote can be
  // seeded with initialUserVote and never has to fetch it separately after
  // the comment already rendered (Phase 7.2).
  const { data: votes } = await supabase
    .from("votes")
    .select("comment_id, vote_type, user_id")
    .in("comment_id", commentIds);

  const scoreByCommentId = new Map<string, number>();
  const userVoteByCommentId = new Map<string, "upvote" | "downvote">();
  (votes || []).forEach((vote) => {
    const id = vote.comment_id;
    if (!id) return;
    const current = scoreByCommentId.get(id) || 0;
    const delta = vote.vote_type === "upvote" ? 1 : -1;
    scoreByCommentId.set(id, current + delta);
    if (viewerId && vote.user_id === viewerId) {
      userVoteByCommentId.set(id, vote.vote_type as "upvote" | "downvote");
    }
  });

  return comments.map((c) => ({
    ...c,
    user: c.user_id ? usersById.get(c.user_id) : undefined,
    score: scoreByCommentId.get(c.id) || 0,
    user_vote: userVoteByCommentId.get(c.id) ?? null,
  }));
}

export function usePostComments(
  postId: string | null | undefined,
  viewerId: string | null,
  blockedUserIds: BlockRecord[]
): {
  flatComments: CommentVM[];
  treeComments: CommentNode[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  isRefetching: boolean;
} {
  const queryClient = useQueryClient();
  const {
    data: flatComments = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<CommentVM[]>({
    queryKey: commentKeys.list(postId, viewerId),
    enabled: Boolean(postId),
    queryFn: async () => {
      if (!postId) return [];
      const fetched = await fetchCommentsWithMeta(postId, viewerId);
      // Keep optimistic comments that are still being created (see
      // useCreateComment) — the server doesn't have them yet, so a refetch
      // mid-send (pull-to-refresh, stale refresh) would otherwise drop them
      // until the send resolves.
      const fetchedIds = new Set(fetched.map((c) => c.id));
      const stillPending = (
        queryClient.getQueryData<CommentVM[]>(commentKeys.list(postId, viewerId)) ?? []
      ).filter((c) => c._pending && !fetchedIds.has(c.id));
      return stillPending.length > 0 ? [...fetched, ...stillPending] : fetched;
    },
    staleTime: 1000 * 30, // show cached comments immediately; silently refresh after 30 s
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

