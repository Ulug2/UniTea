import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import LostFoundListItem from "../../../components/LostFoundListItem";
import LostFoundListSkeleton from "../../../components/LostFoundListSkeleton";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useCallback, useMemo } from "react";
import { Database } from "../../../types/database.types";
import { useAuth } from "../../../context/AuthContext";

type PostSummary = {
  post_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  category: string | null;
  location: string | null;
  post_type: string;
  is_anonymous: boolean | null;
  is_deleted: boolean | null;
  is_edited: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  view_count: number | null;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
  is_banned: boolean | null;
  comment_count: number;
  vote_score: number;
  user_vote: "upvote" | "downvote" | null;
  reposted_from_post_id: string | null;
  repost_comment: string | null;
  repost_count: number;
  original_post_id?: string | null;
  original_content?: string | null;
  original_user_id?: string | null;
  original_author_username?: string | null;
  original_author_avatar?: string | null;
  original_is_anonymous?: boolean | null;
  original_created_at?: string | null;
};

const POSTS_PER_PAGE = 10;

export default function LostFoundScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

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

  // Fetch lost & found posts using optimized view with pagination
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["posts", "lost_found"],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * POSTS_PER_PAGE;
      const to = from + POSTS_PER_PAGE - 1;

      // Type cast needed since view isn't in generated types
      const { data, error } = await (supabase as any)
        .from("posts_summary_view")
        .select("*")
        .eq("post_type", "lost_found")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data || []) as PostSummary[];
    },
    getNextPageParam: (lastPage, allPages) => {
      // If last page has full page of results, there might be more
      if (lastPage.length === POSTS_PER_PAGE) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 1000 * 60 * 2, // Data stays fresh for 2 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  });

  // Flatten pages into single array, remove duplicates, and filter blocked users
  const lostFoundPosts = useMemo(() => {
    const allPosts = postsData?.pages.flat() ?? [];
    // Remove duplicates by post_id
    const uniquePosts = Array.from(
      new Map(allPosts.map((post) => [post.post_id, post])).values()
    );

    // Filter out posts from blocked users (including reposted posts from blocked original authors)
    return uniquePosts.filter((post) => {
      const isPostAuthorBlocked = blocks.includes(post.user_id);
      const isRepostAuthorBlocked = post.original_user_id
        ? blocks.includes(post.original_user_id)
        : false;
      return !isPostAuthorBlocked && !isRepostAuthorBlocked;
    });
  }, [postsData, blocks]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Memoize keyExtractor
  const keyExtractor = useCallback((item: PostSummary) => item.post_id, []);

  // Memoize renderItem to prevent unnecessary re-renders
  const renderItem = useCallback(
    ({ item }: { item: PostSummary }) => (
      <LostFoundListItem
        postId={item.post_id}
        userId={item.user_id}
        content={item.content}
        imageUrl={item.image_url}
        category={item.category}
        location={item.location}
        isAnonymous={item.is_anonymous}
        createdAt={item.created_at}
        username={item.username}
        avatarUrl={item.avatar_url}
        isVerified={item.is_verified}
      />
    ),
    []
  );

  // Show skeleton while loading initial data
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <LostFoundListSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={lostFoundPosts}
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
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                No lost & found posts yet
              </Text>
            </View>
          ) : null
        }
        contentInsetAdjustmentBehavior="automatic"
      />
      {/* Floating Action Button */}
      <Pressable
        onPress={() => router.push("/create-post?type=lost_found")}
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <FontAwesome name="plus" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  text: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
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
