import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import PostListItem from "../../../components/PostListItem";
import PostListSkeleton from "../../../components/PostListSkeleton";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useInfiniteQuery, useQuery, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { Database } from "../../../types/database.types";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { useFilterContext } from "./_filterContext";
import { useAuth } from "../../../context/AuthContext";

type PostSummary = PostsSummaryViewRow;

const POSTS_PER_PAGE = 10;
/** On first open only: wait for this many posts' images/avatars before hiding skeleton overlay */
const FIRST_POSTS_IMAGE_WAIT = 3;

export default function FeedScreen() {
  const { theme } = useTheme();
  const { selectedFilter } = useFilterContext();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  // Debounce ref to prevent cascading invalidations from real-time updates
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // True when we had to fetch (isPending was true)
  const hadPendingRef = useRef(false);
  // Once we've done the "first 3 images" wait once this session, never show overlay again (e.g. filter change = data only)
  const hasCompletedFirstLoadImagesRef = useRef(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const loadingImagesRef = useRef<Set<string>>(new Set());

  // Show a global overlay while any create-post mutation is in flight
  const isCreatingPost = useIsMutating({ mutationKey: ["create-post"] }) > 0;

  // Fetch blocked users
  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", currentUserId],
    enabled: Boolean(currentUserId),
    queryFn: async () => {
      if (!currentUserId) return [];

      // Get users blocked by me and users who blocked me
      const [blockedByMe, blockedMe] = await Promise.all([
        supabase
          .from("blocks")
          .select("blocked_id")
          .eq("blocker_id", currentUserId),
        supabase
          .from("blocks")
          .select("blocker_id")
          .eq("blocked_id", currentUserId),
      ]);

      const blockedUserIds = new Set<string>();
      blockedByMe.data?.forEach((b) => blockedUserIds.add(b.blocked_id));
      blockedMe.data?.forEach((b) => blockedUserIds.add(b.blocker_id));

      return Array.from(blockedUserIds);
    },
    staleTime: 1000 * 60 * 5, // Blocks stay fresh for 5 minutes
    gcTime: 1000 * 60 * 30,
  });

  // Fetch posts using optimized view with pagination
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["posts", "feed", selectedFilter], // Add filter to query key
    // Use default refetchOnMount so cached data shows instantly when revisiting; skeleton only on true initial load
    queryFn: async ({ pageParam = 0 }) => {
      let query = (supabase as any)
        .from("posts_summary_view")
        .select("*")
        .eq("post_type", "feed");

      // Apply sorting based on selected filter
      switch (selectedFilter) {
        case "new":
          // Sort by newest first
          const from = pageParam * POSTS_PER_PAGE;
          const to = from + POSTS_PER_PAGE - 1;
          query = query
            .order("created_at", { ascending: false })
            .range(from, to);
          break;

        case "top":
          // Sort by highest votes in the last week
          const lastWeek = new Date();
          lastWeek.setDate(lastWeek.getDate() - 7);
          const topFrom = pageParam * POSTS_PER_PAGE;
          const topTo = topFrom + POSTS_PER_PAGE - 1;
          query = query
            .gte("created_at", lastWeek.toISOString())
            .order("vote_score", { ascending: false })
            .range(topFrom, topTo);
          break;

        case "hot":
          // For "hot", fetch posts from last 7 days
          // We'll fetch a larger batch and sort by engagement score in memory
          const last7Days = new Date();
          last7Days.setDate(last7Days.getDate() - 7);
          // Fetch 100 posts per page to get better engagement-based sorting
          const hotFrom = pageParam * 100;
          const hotTo = hotFrom + 99;
          query = query
            .gte("created_at", last7Days.toISOString())
            .order("created_at", { ascending: false })
            .range(hotFrom, hotTo);
          break;
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PostSummary[];
    },
    getNextPageParam: (lastPage, allPages) => {
      // For "hot", we fetch 100 at a time for better engagement sorting
      if (selectedFilter === "hot") {
        if (lastPage.length === 100) {
          return allPages.length;
        }
        return undefined;
      }
      // For other filters, use standard pagination
      if (lastPage.length === POSTS_PER_PAGE) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  // Flatten pages into single array, remove duplicates, filter blocked users, and sort by engagement for "hot"
  const posts = useMemo(() => {
    if (!postsData?.pages) return [];

    const allPosts = postsData.pages.flat();
    if (allPosts.length === 0) return [];

    const uniquePosts = Array.from(
      new Map(allPosts.map((post) => [post.post_id, post])).values()
    );

    // Filter blocked users (but keep anonymous posts visible)
    let filteredPosts = uniquePosts;
    if (blocks.length > 0) {
      filteredPosts = uniquePosts.filter((post) => {
        // If post is anonymous, always show it (even if author is blocked)
        if (post.is_anonymous) {
          // For reposts, check if original post is anonymous
          if (post.original_is_anonymous) {
            return true; // Show anonymous reposts
          }
          // Original post is anonymous, show it
          return true;
        }

        // For non-anonymous posts, check if author is blocked
        const isPostAuthorBlocked = blocks.includes(post.user_id);

        // For reposts, check if original author is blocked (but keep if original is anonymous)
        const isRepostAuthorBlocked = post.original_user_id && !post.original_is_anonymous
          ? blocks.includes(post.original_user_id)
          : false;

        // Show post if neither author is blocked (or if original is anonymous)
        return !isPostAuthorBlocked && !isRepostAuthorBlocked;
      });
    }

    // For "hot" filter, sort by engagement (total votes + comments + reposts).
    // Downvotes count as engagement too: use |vote_score| so negativity isn't penalized.
    if (selectedFilter === "hot") {
      return filteredPosts.sort((a, b) => {
        const engagementA =
          Math.abs(a.vote_score || 0) +
          (a.comment_count || 0) +
          (a.repost_count || 0);
        const engagementB =
          Math.abs(b.vote_score || 0) +
          (b.comment_count || 0) +
          (b.repost_count || 0);
        return engagementB - engagementA;
      });
    }

    return filteredPosts;
  }, [postsData, blocks, selectedFilter]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Memoize keyExtractor
  const keyExtractor = useCallback((item: PostSummary) => item.post_id, []);

  // First N post IDs we wait for (only on first open in session)
  const firstBatchIds = useMemo(
    () => posts.slice(0, FIRST_POSTS_IMAGE_WAIT).map((p) => p.post_id),
    [posts]
  );

  if (isPending) hadPendingRef.current = true;

  useEffect(() => {
    if (posts.length > 0 && hadPendingRef.current && !hasCompletedFirstLoadImagesRef.current) {
      setImagesLoaded(false);
      loadingImagesRef.current = new Set();
    }
  }, [posts]);

  const handleImageLoad = useCallback(
    (postId: string) => {
      if (hasCompletedFirstLoadImagesRef.current) return;
      loadingImagesRef.current.add(postId);
      const allLoaded =
        firstBatchIds.length > 0 &&
        firstBatchIds.every((id) => loadingImagesRef.current.has(id));
      if (allLoaded) {
        setImagesLoaded(true);
        hasCompletedFirstLoadImagesRef.current = true;
      }
    },
    [firstBatchIds]
  );

  // Real-time subscription for new posts with debouncing
  useEffect(() => {
    // Track if component is still mounted
    let isMounted = true;

    const channel = supabase
      .channel("posts-feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
        },
        (payload) => {
          // Debounce invalidations to batch rapid posts
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          debounceRef.current = setTimeout(() => {
            if (isMounted) {
              // Only invalidate if we're on the feed (not on other filters that might not show new posts)
              queryClient.invalidateQueries({
                queryKey: ["posts", "feed"],
                refetchType: "none", // Mark as stale but don't refetch automatically
              });
            }
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      // Mark as unmounted FIRST to prevent any queued operations
      isMounted = false;

      // Cleanup timeout on unmount
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }

      // Unsubscribe and remove channel properly
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Memoize renderItem to prevent unnecessary re-renders
  const renderItem = useCallback(
    ({ item }: { item: PostSummary }) => (
      <PostListItem
        postId={item.post_id}
        userId={item.user_id}
        content={item.content}
        imageUrl={item.image_url}
        category={item.category}
        location={item.location}
        postType={item.post_type}
        isAnonymous={item.is_anonymous}
        isEdited={item.is_edited}
        createdAt={item.created_at}
        updatedAt={item.updated_at}
        editedAt={item.edited_at}
        viewCount={item.view_count}
        username={item.username}
        avatarUrl={item.avatar_url}
        isVerified={item.is_verified}
        commentCount={item.comment_count}
        voteScore={item.vote_score}
        repostCount={item.repost_count}
        repostedFromPostId={item.reposted_from_post_id}
        repostComment={item.repost_comment}
        originalContent={item.original_content}
        originalUserId={item.original_user_id}
        originalAuthorUsername={item.original_author_username}
        originalAuthorAvatar={item.original_author_avatar}
        originalIsAnonymous={item.original_is_anonymous}
        originalCreatedAt={item.original_created_at}
        onImageLoad={() => handleImageLoad(item.post_id)}
      />
    ),
    [handleImageLoad]
  );

  // Full-screen skeleton only when we have no data (data still loading)
  const dataLoading = isPending;
  // First open only (we had to fetch and haven't completed image wait yet): overlay until first 3 posts' images/avatars
  const firstLoadImagesLoading =
    hadPendingRef.current &&
    !hasCompletedFirstLoadImagesRef.current &&
    !imagesLoaded &&
    posts.length > 0;

  if (dataLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.skeletonContent}
        >
          <PostListSkeleton />
        </ScrollView>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <FlatList
          data={posts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={true}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={150}
          initialNumToRender={6}
          windowSize={10}
          // Disable auto-scroll to top when data changes (prevents jarring jumps)
          maintainVisibleContentPosition={undefined}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.primary}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ padding: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                No posts yet
              </Text>
            </View>
          }
          contentInsetAdjustmentBehavior="automatic"
        />
        {/* First open only: overlay skeleton until first 3 posts' images/avatars loaded */}
        {firstLoadImagesLoading && (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}
            pointerEvents="none"
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.skeletonContent}
            >
              <PostListSkeleton />
            </ScrollView>
          </View>
        )}
        {/* Floating Action Button */}
        <Pressable
          onPress={() => router.push("/create-post")}
          style={[styles.fab, { backgroundColor: theme.primary }]}
        >
          <FontAwesome name="plus" size={28} color="#fff" />
        </Pressable>
      </View>
      {/* Global create-post overlay: full-screen white transparent cover while post mutation is in flight */}
      <Modal
        visible={isCreatingPost}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(255, 255, 255, 0.6)",
              justifyContent: "center",
              alignItems: "center",
            },
          ]}
          // Block all touches while overlay is shown
          pointerEvents="auto"
        >
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skeletonContent: {
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
});
