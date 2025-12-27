import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  RefreshControl,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import PostListItem from "../../../components/PostListItem";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { Tables } from "../../../types/database.types";
import { useQuery } from "@tanstack/react-query";

type Post = Tables<"posts">;
type User = Tables<"profiles">;
type Comment = Tables<"comments">;
type PostWithUser = Post & { user: User | null; commentCount: number };

const fetchPosts = async (): Promise<PostWithUser[]> => {
  // Fetch posts - only feed type posts
  const { data: postsData, error: postsError } = await supabase
    .from("posts")
    .select("*")
    .eq("post_type", "feed")
    .order("created_at", { ascending: false });

  if (postsError) {
    throw postsError;
  }

  const posts = (postsData as Post[]) ?? [];
  const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
  const postIds = posts.map((p) => p.id);

  // Fetch profiles for those user_ids
  let profileMap = new Map<string, User>();
  if (userIds.length) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id, username, avatar_url, bio, is_verified, is_banned, created_at, updated_at"
      )
      .in("id", userIds);

    if (profilesError) throw profilesError;
    profileMap = new Map((profilesData as User[]).map((p) => [p.id, p]));
  }

  // Fetch comment counts for these posts
  let commentCountMap = new Map<string, number>();
  if (postIds.length) {
    const { data: commentsData, error: commentsError } = await supabase
      .from("comments")
      .select("post_id, is_deleted")
      .in("post_id", postIds);

    if (commentsError) throw commentsError;

    commentCountMap =
      (commentsData as Comment[])?.reduce((map, c) => {
        if (c.is_deleted) return map;
        const current = map.get(c.post_id) ?? 0;
        map.set(c.post_id, current + 1);
        return map;
      }, new Map<string, number>()) ?? new Map<string, number>();
  }

  const withUsers: PostWithUser[] = posts.map((p) => ({
    ...p,
    user: (profileMap.get(p.user_id) as User | undefined) ?? null,
    commentCount: commentCountMap.get(p.id) ?? 0,
  }));

  return withUsers;
};

export default function FeedScreen() {
  const { theme } = useTheme();
  const {
    data: posts = [],
    error,
    isLoading,
    refetch: refetchPosts,
    isRefetching: isRefetchingPosts,
  } = useQuery<PostWithUser[]>({
    queryKey: ["posts"],
    queryFn: fetchPosts,
    staleTime: 1000 * 60 * 2, // Posts stay fresh for 2 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  });

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: theme.text }}>
          Failed to load posts: {(error as Error).message}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostListItem
            post={item}
            user={item.user ?? null}
            commentCount={item.commentCount}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingPosts}
            onRefresh={refetchPosts}
            tintColor={theme.primary}
          />
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
