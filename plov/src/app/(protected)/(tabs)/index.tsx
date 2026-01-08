import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import PostListItem from "../../../components/PostListItem";
import PostListSkeleton from "../../../components/PostListSkeleton";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { PostSummary } from "../../../types/types";

const POSTS_PER_PAGE = 10;

export default function FeedScreen() {
  const { theme } = useTheme();

  // Fetch posts using optimized view with pagination
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["posts", "feed"],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * POSTS_PER_PAGE;
      const to = from + POSTS_PER_PAGE - 1;

      // Type cast needed since view isn't in generated types
      const { data, error } = await (supabase as any)
        .from("posts_summary_view")
        .select("*")
        .eq("post_type", "feed")
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
    staleTime: 1000 * 60 * 2, // Posts stay fresh for 2 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  });

  // Flatten pages into single array and remove duplicates
  const posts = useMemo(() => {
    const allPosts = postsData?.pages.flat() ?? [];
    // Remove duplicates by post_id
    const uniquePosts = Array.from(
      new Map(allPosts.map(post => [post.post_id, post])).values()
    );
    return uniquePosts;
  }, [postsData]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Show skeleton while loading initial data
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <PostListSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.post_id}
        renderItem={({ item }) => (
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
            userVote={item.user_vote}
            repostCount={item.repost_count}
            repostedFromPostId={item.reposted_from_post_id}
            repostComment={item.repost_comment}
            originalContent={item.original_content}
            originalAuthorUsername={item.original_author_username}
            originalAuthorAvatar={item.original_author_avatar}
            originalIsAnonymous={item.original_is_anonymous}
            originalCreatedAt={item.original_created_at}
          />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
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
                No posts yet
              </Text>
            </View>
          ) : null
        }
        contentInsetAdjustmentBehavior="automatic"
      />
      {/* Floating Action Button */}
      <Pressable
        onPress={() => router.push("/create-post")}
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
