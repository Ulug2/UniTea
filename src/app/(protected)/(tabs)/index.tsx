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
  Dimensions,
} from "react-native";
import PagerView from "react-native-pager-view";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import PostListItem from "../../../components/PostListItem";
import PostListSkeleton from "../../../components/PostListSkeleton";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useInfiniteQuery, useQuery, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { useCallback, useMemo, useEffect, useRef } from "react";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { useFilterContext } from "../../../context/FilterContext";
import { useAuth } from "../../../context/AuthContext";

type PostSummary = PostsSummaryViewRow;

const POSTS_PER_PAGE = 10;

const FEED_FILTER_ORDER = ["hot", "new", "top"] as const;
type FeedFilterType = (typeof FEED_FILTER_ORDER)[number];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Single feed "page" for one filter – used inside the horizontal pager
function FeedPageContent({ filter }: { filter: FeedFilterType }) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

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

  // Fetch posts for this filter only
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["posts", "feed", filter],
    queryFn: async ({ pageParam = 0 }) => {
      let query = (supabase as any)
        .from("posts_summary_view")
        .select("*")
        .eq("post_type", "feed")
        .or("is_banned.is.null,is_banned.eq.false");

      switch (filter) {
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
      if (filter === "hot") {
        if (lastPage.length === 100) return allPages.length;
        return undefined;
      }
      if (lastPage.length === POSTS_PER_PAGE) return allPages.length;
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

    if (filter === "hot") {
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
  }, [postsData, blocks, filter]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const keyExtractor = useCallback((item: PostSummary) => item.post_id, []);

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
      />
    ),
    []
  );

  if (isPending) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
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
    <View style={[styles.page, { backgroundColor: theme.background }]}>
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
    </View>
  );
}

// Main feed screen: native pager (Instagram-style) – content slides with your finger
export default function FeedScreen() {
  const { theme } = useTheme();
  const { selectedFilter, setSelectedFilter } = useFilterContext();
  const queryClient = useQueryClient();
  const pagerRef = useRef<PagerView>(null);

  const isCreatingPost = useIsMutating({ mutationKey: ["create-post"] }) > 0;

  // When user taps a filter pill, switch page with animation
  useEffect(() => {
    const pageIndex = FEED_FILTER_ORDER.indexOf(selectedFilter as FeedFilterType);
    if (pageIndex < 0) return;
    pagerRef.current?.setPage(pageIndex);
  }, [selectedFilter]);

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      const position = e.nativeEvent.position;
      const filter = FEED_FILTER_ORDER[Math.min(position, FEED_FILTER_ORDER.length - 1)];
      setSelectedFilter(filter);
    },
    [setSelectedFilter]
  );

  useEffect(() => {
    let isMounted = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("posts-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            if (isMounted) {
              queryClient.invalidateQueries({
                queryKey: ["posts", "feed"],
                refetchType: "none",
              });
            }
          }, 1000);
        }
      )
      .subscribe();
    return () => {
      isMounted = false;
      if (debounce) clearTimeout(debounce);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const initialPageIndex = FEED_FILTER_ORDER.indexOf(selectedFilter as FeedFilterType);

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={Math.max(0, initialPageIndex)}
          onPageSelected={handlePageSelected}
        >
          {FEED_FILTER_ORDER.map((filter) => (
            <View key={filter} style={styles.pageWrapper}>
              <FeedPageContent filter={filter} />
            </View>
          ))}
        </PagerView>
        <Pressable
          onPress={() => router.push("/create-post")}
          style={[styles.fab, { backgroundColor: theme.primary }]}
        >
          <FontAwesome name="plus" size={28} color="#fff" />
        </Pressable>
      </View>
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
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  pageWrapper: {
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
