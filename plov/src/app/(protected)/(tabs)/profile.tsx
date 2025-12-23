import {
  View,
  Text,
  Switch,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useState, useEffect, useMemo } from "react";
import { router, useNavigation } from "expo-router";
import { formatDistanceToNowStrict } from "date-fns";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Tables } from "../../../types/database.types";

type Profile = Tables<"profiles">;
type Post = Tables<"posts">;
type Vote = Tables<"votes">;
type Comment = Tables<"comments">;

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { session } = useAuth();
  const navigation = useNavigation();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "anonymous">("all");

  // Fetch current user profile
  const { data: currentUser, refetch: refetchProfile } =
    useQuery<Profile | null>({
      queryKey: ["current-user-profile"],
      queryFn: async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;
        if (!userId) return null;

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (error) throw error;
        return data;
      },
      staleTime: 1000 * 60 * 10, // Profile stays fresh for 10 minutes
      gcTime: 1000 * 60 * 60, // Cache for 1 hour
      retry: 2,
    });

  // Fetch user's posts
  const {
    data: userPosts = [],
    refetch: refetchPosts,
    isRefetching,
  } = useQuery<Post[]>({
    queryKey: ["user-posts", session?.user?.id],
    queryFn: async () => {
      const userId = session?.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", userId)
        .eq("post_type", "feed")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(session?.user?.id),
    staleTime: 1000 * 60 * 2, // Posts stay fresh for 2 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  });

  // Get all post IDs for batch queries
  const postIds = userPosts.map((p) => p.id);

  // Fetch votes for all user posts
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
    staleTime: 1000 * 30, // Votes stay fresh for 30 seconds
    gcTime: 1000 * 60 * 10, // Cache for 10 minutes
    retry: 2,
  });

  // Fetch comments for all user posts
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
    staleTime: 1000 * 60, // Comments stay fresh for 1 minute
    gcTime: 1000 * 60 * 15, // Cache for 15 minutes
    retry: 2,
  });

  // Get current user data
  const userDisplayName = currentUser?.username || "User";
  const userEmail = session?.user?.email || "email@example.com";
  const userInitials = userDisplayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Set up settings button handler
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setSettingsVisible(true)}
          style={{ paddingRight: 15 }}
        >
          <Ionicons name="settings-outline" size={22} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, theme, setSettingsVisible]);

  // Calculate post scores from votes
  const postScoresMap = useMemo(() => {
    const scoresMap = new Map<string, number>();
    postVotes.forEach((vote) => {
      if (!vote.post_id) return;
      const currentScore = scoresMap.get(vote.post_id) || 0;
      const voteValue = vote.vote_type === "upvote" ? 1 : -1;
      scoresMap.set(vote.post_id, currentScore + voteValue);
    });
    return scoresMap;
  }, [postVotes]);

  // Calculate comment counts per post
  const commentCountsMap = useMemo(() => {
    const countsMap = new Map<string, number>();
    postComments.forEach((comment) => {
      const currentCount = countsMap.get(comment.post_id) || 0;
      countsMap.set(comment.post_id, currentCount + 1);
    });
    return countsMap;
  }, [postComments]);

  // Calculate total upvotes
  const totalUpvotes = useMemo(() => {
    return Array.from(postScoresMap.values()).reduce(
      (sum, score) => sum + Math.max(0, score),
      0
    );
  }, [postScoresMap]);

  // Filter posts based on active tab
  const filteredPosts =
    activeTab === "all" ? userPosts : userPosts.filter((p) => p.is_anonymous);

  async function signOut() {
    setSettingsVisible(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error:", error.message);
      return;
    }
    router.replace("/(auth)");
  }

  const renderPostItem = ({ item }: { item: Post }) => {
    const postScore = postScoresMap.get(item.id) || 0;
    const commentCount = commentCountsMap.get(item.id) || 0;
    const timeAgo = item.created_at
      ? formatDistanceToNowStrict(new Date(item.created_at), {
          addSuffix: false,
        })
      : "";

    return (
      <Pressable
        style={[
          styles.postCard,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
        onPress={() => router.push(`/post/${item.id}`)}
      >
        <View style={styles.postHeader}>
          <Text style={[styles.postLabel, { color: theme.secondaryText }]}>
            Posted {item.is_anonymous ? "anonymously" : "publicly"}
          </Text>
          <Text style={[styles.postTime, { color: theme.secondaryText }]}>
            {timeAgo}
          </Text>
        </View>
        <Text
          style={[styles.postContent, { color: theme.text }]}
          numberOfLines={2}
        >
          {item.content}
        </Text>
        <View style={styles.postFooter}>
          <View style={styles.postStat}>
            <MaterialCommunityIcons
              name="arrow-up-bold"
              size={16}
              color="#51CF66"
            />
            <Text style={[styles.postStatText, { color: theme.secondaryText }]}>
              {postScore}
            </Text>
          </View>
          <View style={styles.postStat}>
            <MaterialCommunityIcons
              name="comment-outline"
              size={16}
              color={theme.secondaryText}
            />
            <Text style={[styles.postStatText, { color: theme.secondaryText }]}>
              {commentCount}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        ListHeaderComponent={
          <>
            {/* USER INFO CARD */}
            <View style={[styles.userCard, { backgroundColor: theme.card }]}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{userInitials}</Text>
                </View>
              </View>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>
                  {userDisplayName}
                </Text>
                <Text
                  style={[styles.userEmail, { color: theme.secondaryText }]}
                >
                  {userEmail}
                </Text>
                <View style={styles.upvotesContainer}>
                  <MaterialCommunityIcons
                    name="arrow-up-bold"
                    size={16}
                    color="#51CF66"
                  />
                  <Text style={styles.upvotesText}>
                    {totalUpvotes} total upvotes
                  </Text>
                </View>
              </View>
            </View>

            {/* TABS */}
            <View style={styles.tabsContainer}>
              <Pressable
                style={[
                  styles.tab,
                  activeTab === "all" && styles.activeTab,
                  {
                    backgroundColor:
                      activeTab === "all" ? theme.card : "transparent",
                  },
                ]}
                onPress={() => setActiveTab("all")}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color:
                        activeTab === "all" ? theme.text : theme.secondaryText,
                    },
                  ]}
                >
                  All Posts
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tab,
                  activeTab === "anonymous" && styles.activeTab,
                  {
                    backgroundColor:
                      activeTab === "anonymous" ? theme.card : "transparent",
                  },
                ]}
                onPress={() => setActiveTab("anonymous")}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color:
                        activeTab === "anonymous"
                          ? theme.text
                          : theme.secondaryText,
                    },
                  ]}
                >
                  Anonymous
                </Text>
              </Pressable>
            </View>
          </>
        }
        data={filteredPosts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetchProfile();
              refetchPosts();
            }}
            tintColor={theme.primary}
          />
        }
      />

      {/* SETTINGS BOTTOM SHEET */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSettingsVisible(false)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: theme.card }]}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={[styles.modalHandle, { backgroundColor: theme.border }]}
            />
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Settings
            </Text>

            <ScrollView style={styles.settingsScroll}>
              {/* Dark Mode Toggle */}
              <Pressable
                style={[styles.settingRow, { borderBottomColor: theme.border }]}
              >
                <View style={styles.settingLeft}>
                  <Ionicons name="moon-outline" size={22} color={theme.text} />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>
                    Dark Mode
                  </Text>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={isDark ? "#fff" : "#f4f3f4"}
                />
              </Pressable>

              {/* Notifications */}
              <Pressable
                style={[styles.settingRow, { borderBottomColor: theme.border }]}
              >
                <View style={styles.settingLeft}>
                  <Ionicons
                    name="notifications-outline"
                    size={22}
                    color={theme.text}
                  />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>
                    Notifications
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.secondaryText}
                />
              </Pressable>

              {/* Terms of Service */}
              <Pressable
                style={[styles.settingRow, { borderBottomColor: theme.border }]}
              >
                <View style={styles.settingLeft}>
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color={theme.text}
                  />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>
                    Terms of Service
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.secondaryText}
                />
              </Pressable>

              {/* Privacy Policy */}
              <Pressable
                style={[styles.settingRow, { borderBottomColor: theme.border }]}
              >
                <View style={styles.settingLeft}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={22}
                    color={theme.text}
                  />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>
                    Privacy Policy
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.secondaryText}
                />
              </Pressable>

              {/* Logout */}
              <Pressable
                style={[styles.settingRow, { borderBottomColor: theme.border }]}
                onPress={signOut}
              >
                <View style={styles.settingLeft}>
                  <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
                  <Text style={[styles.settingLabel, { color: "#FF6B6B" }]}>
                    Logout
                  </Text>
                </View>
              </Pressable>

              {/* Delete Account */}
              <Pressable style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                  <Text style={[styles.settingLabel, { color: "#FF6B6B" }]}>
                    Delete Account
                  </Text>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  userCard: {
    flexDirection: "row",
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 16,
    gap: 16,
  },
  avatarContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#5DBEBC",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 32,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
  },
  userInfo: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  userName: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
  },
  userEmail: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  upvotesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  upvotesText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "#51CF66",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  activeTab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  postCard: {
    padding: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  postLabel: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  postTime: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  postContent: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
    lineHeight: 22,
  },
  postFooter: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  postStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postStatText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: "60%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    marginBottom: 16,
  },
  settingsScroll: {
    paddingHorizontal: 20,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
});
