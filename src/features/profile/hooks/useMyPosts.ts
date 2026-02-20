import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { useBlocks } from "../../../hooks/useBlocks";

type Post = Database["public"]["Tables"]["posts"]["Row"];
type Vote = Database["public"]["Tables"]["votes"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];
type PostSummary = PostsSummaryViewRow;

const PAGE_SIZE = 10;

export type ProfileTab = "all" | "anonymous" | "bookmarked";

export function useMyPosts(userId: string | undefined, activeTab: ProfileTab) {
  const { data: blocks = [] } = useBlocks();

  const {
    data: userPostsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchPosts,
    isRefetching,
  } = useInfiniteQuery<PostSummary[]>({
    queryKey: ["user-posts", userId],
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) ?? 0;
      const from = page * PAGE_SIZE;
      const to = from + (PAGE_SIZE - 1);

      if (!userId) return [];

      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data || []) as PostSummary[];
    },
    enabled: Boolean(userId),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    retry: 2,
  });

  const userPosts = (userPostsData?.pages || []).flat();

  const {
    data: bookmarkedPostsData,
  } = useQuery<PostSummary[]>({
    queryKey: ["bookmarked-posts", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data: bookmarks, error: bookmarksError } = await supabase
        .from("bookmarks")
        .select("post_id, created_at")
        .eq("user_id", userId);

      if (bookmarksError) throw bookmarksError;

      const postIds = bookmarks.map((b) => b.post_id);
      if (postIds.length === 0) return [];

      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .in("post_id", postIds)
        .or("is_banned.is.null,is_banned.eq.false");

      if (error) throw error;

      const sortedData = ((data || []) as PostSummary[]).sort((a, b) => {
        const aBookmark = bookmarks.find((bm) => bm.post_id === a.post_id);
        const bBookmark = bookmarks.find((bm) => bm.post_id === b.post_id);
        return (
          new Date(bBookmark?.created_at || 0).getTime() -
          new Date(aBookmark?.created_at || 0).getTime()
        );
      });

      return sortedData;
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  const bookmarkedPosts = bookmarkedPostsData || [];

  const allPosts = activeTab === "bookmarked" ? bookmarkedPosts : userPosts;
  const postIds = allPosts.map((p) =>
    "post_id" in p ? p.post_id : (p as Post).id
  );

  const { data: postVotes = [] } = useQuery<Vote[]>({
    queryKey: ["user-post-votes", postIds],
    queryFn: async () => {
      if (postIds.length === 0) return [];

      const { data, error } = await supabase
        .from("votes")
        .select("*")
        .in("post_id", postIds)
        .not("post_id", "is", null);

      if (error) throw error;
      return data || [];
    },
    enabled: postIds.length > 0,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    retry: 2,
  });

  const { data: postComments = [] } = useQuery<Comment[]>({
    queryKey: ["user-post-comments", postIds],
    queryFn: async () => {
      if (postIds.length === 0) return [];

      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .in("post_id", postIds);

      if (error) throw error;
      return data || [];
    },
    enabled: postIds.length > 0,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 15,
    retry: 2,
  });

  const postScoresMap = useMemo(() => {
    const scoresMap = new Map<string, number>();
    postVotes.forEach((vote) => {
      if (!vote.post_id) return;
      const currentScore = scoresMap.get(vote.post_id) || 0;
      const voteValue = vote.vote_type === "upvote" ? 1 : -1;
      scoresMap.set(vote.post_id, currentScore + voteValue);
    });

    if (activeTab !== "bookmarked") {
      userPosts.forEach((post) => {
        if (!scoresMap.has(post.post_id)) {
          scoresMap.set(post.post_id, post.vote_score || 0);
        }
      });
    }
    return scoresMap;
  }, [postVotes, userPosts, activeTab]);

  const commentCountsMap = useMemo(() => {
    const countsMap = new Map<string, number>();
    postComments.forEach((comment) => {
      const currentCount = countsMap.get(comment.post_id) || 0;
      countsMap.set(comment.post_id, currentCount + 1);
    });

    if (activeTab !== "bookmarked") {
      userPosts.forEach((post) => {
        if (!countsMap.has(post.post_id)) {
          countsMap.set(post.post_id, post.comment_count || 0);
        }
      });
    }
    return countsMap;
  }, [postComments, userPosts, activeTab]);

  const totalVotes = useMemo(() => {
    return Array.from(postScoresMap.values()).reduce(
      (sum, score) => sum + score,
      0
    );
  }, [postScoresMap]);

  const filteredPosts = useMemo(() => {
    const getId = (p: PostSummary | Post) =>
      "post_id" in p ? p.post_id : (p as Post).id;
    let list: (PostSummary | Post)[];
    if (activeTab === "all") {
      list = userPosts;
    } else if (activeTab === "anonymous") {
      list = userPosts.filter((p) => p.is_anonymous);
    } else {
      list = bookmarkedPosts.filter((p) => !blocks.includes(p.user_id));
    }
    const seen = new Set<string>();
    return list.filter((p) => {
      const id = getId(p);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [activeTab, userPosts, bookmarkedPosts, blocks]);

  return {
    userPosts,
    bookmarkedPosts,
    filteredPosts,
    postScoresMap,
    commentCountsMap,
    totalVotes,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetchPosts,
    isRefetching,
  };
}

