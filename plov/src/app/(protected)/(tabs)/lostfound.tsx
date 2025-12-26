import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import LostFoundListItem from "../../../components/LostFoundListItem";
import { Tables } from "../../../types/database.types";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

type Post = Tables<"posts">;
type User = Tables<"profiles">;
type PostWithUser = Post & { user: User | null };

const fetchLostFoundPosts = async (): Promise<PostWithUser[]> => {
  // Fetch lost & found posts
  const { data: postsData, error: postsError } = await supabase
    .from("posts")
    .select("*")
    .eq("post_type", "lost_found")
    .order("created_at", { ascending: false });

  if (postsError) {
    throw postsError;
  }

  const posts = (postsData as Post[]) ?? [];
  const userIds = Array.from(new Set(posts.map((p) => p.user_id)));

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

  const withUsers: PostWithUser[] = posts.map((p) => ({
    ...p,
    user: (profileMap.get(p.user_id) as User | undefined) ?? null,
  }));

  return withUsers;
};

export default function LostFoundScreen() {
  const { theme } = useTheme();

  const {
    data: lostFoundPosts = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<PostWithUser[]>({
    queryKey: ["posts", "lost_found"],
    queryFn: fetchLostFoundPosts,
    staleTime: 1000 * 60 * 2, // Data stays fresh for 2 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2, // Retry failed requests twice
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={lostFoundPosts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LostFoundListItem post={item} user={item.user} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.primary}
          />
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
