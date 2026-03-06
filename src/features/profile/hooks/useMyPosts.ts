import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { useBlocks, isBlockedPost } from "../../../hooks/useBlocks";
import {
  saveUserPostsToStorage,
  saveUserTotalVotesToStorage,
} from "../../../utils/feedPersistence";

type Post = Database["public"]["Tables"]["posts"]["Row"];
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
        .neq("post_type", "lost_found")
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

  // Persist the first page so the profile can show the correct totalVotes
  // immediately on the next cold start (same SWR pattern as the feed tabs).
  useEffect(() => {
    if (!userId || !userPostsData?.pages?.length) return;
    saveUserPostsToStorage(userId, userPostsData.pages as PostSummary[][]);
  }, [userId, userPostsData]);

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

  // Use the pre-aggregated vote_score and comment_count that posts_summary_view
  // already computes server-side. Fetching raw votes/comments separately and
  // re-counting client-side caused stale-cache flicker (e.g. 20 → 26) because
  // the two caches could be out of sync. The view values are always authoritative.
  const activePosts = activeTab === "bookmarked" ? bookmarkedPosts : userPosts;

  const postScoresMap = useMemo(() => {
    const scoresMap = new Map<string, number>();
    activePosts.forEach((post) => {
      scoresMap.set(post.post_id, post.vote_score ?? 0);
    });
    return scoresMap;
  }, [activePosts]);

  const commentCountsMap = useMemo(() => {
    const countsMap = new Map<string, number>();
    activePosts.forEach((post) => {
      countsMap.set(post.post_id, post.comment_count ?? 0);
    });
    return countsMap;
  }, [activePosts]);

  // Fetch the TRUE total vote count across ALL of the user's posts in one query.
  // Computing it from the paginated userPosts was wrong — it grew as more pages
  // loaded (e.g. 20 → 26 as page 2 arrived). This query has no pagination limit.
  const { data: totalVotes = 0 } = useQuery<number>({
    queryKey: ["user-total-votes", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("vote_score")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (r.vote_score ?? 0), 0);
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 10,
  });

  // Persist the total so it is available instantly on the next cold start.
  useEffect(() => {
    if (!userId || totalVotes === 0) return;
    saveUserTotalVotesToStorage(userId, totalVotes);
  }, [userId, totalVotes]);

  const filteredPosts = useMemo(() => {
    const getId = (p: PostSummary | Post) =>
      "post_id" in p ? p.post_id : (p as Post).id;
    let list: (PostSummary | Post)[];
    if (activeTab === "all") {
      list = userPosts;
    } else if (activeTab === "anonymous") {
      list = userPosts.filter((p) => p.is_anonymous);
    } else {
      list = bookmarkedPosts.filter(
        (p) => !isBlockedPost(blocks, p.user_id, p.is_anonymous ?? false)
      );
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

