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
  Alert,
  Image,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useState, useEffect, useMemo } from "react";
import { router, useNavigation } from "expo-router";
import { formatDistanceToNowStrict } from "date-fns";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { Database } from "../../../types/database.types";
import ManageAccountModal from "../../../components/ManageAccountModal";
import * as ImagePicker from "expo-image-picker";
import { uploadImage } from "../../../utils/supabaseImages";
import SupabaseImage from "../../../components/SupabaseImage";
import nuLogo from "../../../../assets/images/nu-logo.png";
import NotificationSettingsModal from "../../../components/NotificationSettingsModal";
import { usePushNotifications } from "../../../hooks/usePushNotifications";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Post = Database["public"]["Tables"]["posts"]["Row"];
type Vote = Database["public"]["Tables"]["votes"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];

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

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { session } = useAuth();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [manageAccountVisible, setManageAccountVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "all" | "anonymous" | "bookmarked"
  >("all");
  const [notificationsVisible, setNotificationsVisible] = useState(false);

  // Register / refresh Expo push token when profile screen is loaded
  usePushNotifications();

  // Fetch blocked users
  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", session?.user?.id],
    enabled: Boolean(session?.user?.id),
    queryFn: async () => {
      const currentUserId = session?.user?.id;
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

  // Fetch current user profile
  const {
    data: currentUser,
    refetch: refetchProfile,
    isLoading: isLoadingProfile,
  } = useQuery<Profile | null>({
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

  // Fetch user's posts with infinite scroll
  const {
    data: userPostsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchPosts,
    isRefetching,
  } = useInfiniteQuery<PostSummary[]>({
    queryKey: ["user-posts", session?.user?.id],
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * 10;
      const to = from + 9;
      const userId = session?.user?.id;

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
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 10 ? allPages.length : undefined;
    },
    initialPageParam: 0,
    enabled: Boolean(session?.user?.id),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  // Flatten pages into single array
  const userPosts = useMemo(() => {
    if (!userPostsData?.pages) return [];
    return userPostsData.pages.flat();
  }, [userPostsData]);

  // Fetch user's bookmarked posts
  const { data: bookmarkedPosts = [], refetch: refetchBookmarks } = useQuery<
    Post[]
  >({
    queryKey: ["bookmarked-posts", session?.user?.id],
    queryFn: async () => {
      const userId = session?.user?.id;
      if (!userId) return [];

      // First get bookmark IDs with creation dates
      const { data: bookmarks, error: bookmarkError } = await supabase
        .from("bookmarks")
        .select("post_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (bookmarkError) throw bookmarkError;
      if (!bookmarks || bookmarks.length === 0) return [];

      const bookmarkedPostIds = bookmarks.map((b) => b.post_id);

      // Then get the actual posts (filter out deleted posts)
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .in("id", bookmarkedPostIds)
        .eq("is_deleted", false);

      if (error) throw error;

      // Sort by bookmark creation date (most recently bookmarked first)
      const sortedData = data?.sort((a, b) => {
        const aBookmark = bookmarks.find((bm) => bm.post_id === a.id);
        const bBookmark = bookmarks.find((bm) => bm.post_id === b.id);
        return (
          new Date(bBookmark?.created_at || 0).getTime() -
          new Date(aBookmark?.created_at || 0).getTime()
        );
      });

      return sortedData || [];
    },
    enabled: Boolean(session?.user?.id),
    staleTime: 1000 * 30, // Bookmarks stay fresh for 30 seconds (more responsive)
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  });

  // Get all post IDs for batch queries
  const allPosts = activeTab === "bookmarked" ? bookmarkedPosts : userPosts;
  const postIds = allPosts.map((p) => {
    // Check if it's a PostSummary (has post_id) or Post (has id)
    return "post_id" in p ? p.post_id : p.id;
  });

  // Fetch votes for all user posts
  const { data: postVotes = [], refetch: refetchVotes } = useQuery<Vote[]>({
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
  const { data: postComments = [], refetch: refetchComments } = useQuery<
    Comment[]
  >({
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
    staleTime: 1000 * 30, // Comments stay fresh for 30 seconds (more responsive)
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
    // For user posts from summary view, use the pre-calculated vote_score
    if (activeTab !== "bookmarked") {
      userPosts.forEach((post) => {
        if (!scoresMap.has(post.post_id)) {
          scoresMap.set(post.post_id, post.vote_score || 0);
        }
      });
    }
    return scoresMap;
  }, [postVotes, userPosts, activeTab]);

  // Calculate comment counts per post
  const commentCountsMap = useMemo(() => {
    const countsMap = new Map<string, number>();
    postComments.forEach((comment) => {
      const currentCount = countsMap.get(comment.post_id) || 0;
      countsMap.set(comment.post_id, currentCount + 1);
    });
    // For user posts from summary view, use the pre-calculated comment_count
    if (activeTab !== "bookmarked") {
      userPosts.forEach((post) => {
        if (!countsMap.has(post.post_id)) {
          countsMap.set(post.post_id, post.comment_count || 0);
        }
      });
    }
    return countsMap;
  }, [postComments, userPosts, activeTab]);

  // Calculate total upvotes
  const totalUpvotes = useMemo(() => {
    return Array.from(postScoresMap.values()).reduce(
      (sum, score) => sum + Math.max(0, score),
      0
    );
  }, [postScoresMap]);

  // Filter posts based on active tab (and filter blocked users from bookmarked posts)
  const filteredPosts = useMemo(() => {
    if (activeTab === "all") {
      return userPosts;
    } else if (activeTab === "anonymous") {
      return userPosts.filter((p) => p.is_anonymous);
    } else {
      // Filter out bookmarked posts from blocked users
      // Note: bookmarkedPosts uses Post type (not PostSummary), so we only check the post author
      // Reposted posts from blocked authors will be filtered when viewing the feed
      return bookmarkedPosts.filter((p) => !blocks.includes(p.user_id));
    }
  }, [activeTab, userPosts, bookmarkedPosts, blocks]);

  async function signOut() {
    setSettingsVisible(false);
    setManageAccountVisible(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        // Network errors can occur when offline – log but still navigate to auth
        console.error("Sign out error:", error.message);
      }
    } catch (err: any) {
      console.error(
        "Unexpected sign out error:",
        err?.message ? err.message : err
      );
    } finally {
      // Always navigate back to auth, even if the network request failed.
      // Local session will be cleared on next successful auth call.
      router.replace("/(auth)");
    }
  }

  // Unblock all users mutation
  const unblockAllMutation = useMutation({
    mutationFn: async () => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) throw new Error("User ID missing");

      // Delete all blocks where current user is the blocker
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", currentUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate blocks query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      // Invalidate all content queries to show unblocked users' content
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });

      Alert.alert("Success", "All users have been unblocked");
      setManageAccountVisible(false);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to unblock users");
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) throw new Error("User ID missing");

      // Call the database function to delete both profile and auth user
      // This function uses SECURITY DEFINER to have admin privileges
      // It will:
      // 1. Delete the profile (cascades to all related data)
      // 2. Delete the auth user from auth.users
      const { error } = await (supabase.rpc as any)("delete_user_account");

      if (error) throw error;

      // Sign out the user (session will be invalid anyway, but this ensures clean state)
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      // Clear all queries
      queryClient.clear();
      // Navigate to auth screen
      router.replace("/(auth)");
      Alert.alert("Success", "Your account has been deleted");
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error.message || "Failed to delete account. Please try again."
      );
    },
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone. All your posts, comments, votes, and other data will be permanently deleted.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteAccountMutation.mutate(),
        },
      ]
    );
  };

  const handleUnblockAll = () => {
    Alert.alert(
      "Unblock All Users",
      "Are you sure you want to unblock all users? You will be able to see all posts and comments again.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Unblock All",
          onPress: () => unblockAllMutation.mutate(),
        },
      ]
    );
  };

  // Update profile mutation (for username and avatar)
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: { username?: string; avatar_url?: string }) => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) throw new Error("User ID missing");

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate profile query to reflect changes immediately
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      // Also invalidate posts queries since username/avatar might be displayed in feeds
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      Alert.alert("Success", "Profile updated successfully");
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error.message || "Failed to update profile. Please try again."
      );
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      Alert.alert("Success", "Password updated successfully");
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error.message || "Failed to update password. Please try again."
      );
    },
  });

  // Handle avatar update
  const handleAvatarUpdate = async () => {
    try {
      // Launch image picker (permissions are handled automatically by expo-image-picker)
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for avatars
        quality: 0.8,
      });

      if (result.canceled) return;

      // Upload image to Supabase Storage
      const imagePath = await uploadImage(
        result.assets[0].uri,
        supabase,
        "avatars" // Use avatars bucket
      );

      // Update profile with new avatar URL
      updateProfileMutation.mutate({ avatar_url: imagePath });
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || "Failed to update avatar. Please try again."
      );
    }
  };

  // Handle username update
  const handleUsernameUpdate = (newUsername: string) => {
    if (!newUsername.trim()) {
      Alert.alert("Error", "Username cannot be empty");
      return;
    }
    updateProfileMutation.mutate({ username: newUsername.trim() });
  };

  // Handle password update
  const handlePasswordUpdate = (
    newPassword: string,
    confirmPassword: string
  ) => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    updatePasswordMutation.mutate(newPassword);
  };

  const renderPostItem = ({ item }: { item: PostSummary | Post }) => {
    const postId = "post_id" in item ? item.post_id : item.id;
    const postScore = postScoresMap.get(postId) || 0;
    const commentCount = commentCountsMap.get(postId) || 0;
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
        onPress={() => router.push(`/post/${postId}`)}
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

  // Show loading while fetching profile to prevent "User" flicker
  if (isLoadingProfile) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <Text style={[styles.userName, { color: theme.secondaryText }]}>
          Loading...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        ListHeaderComponent={
          <>
            {/* USER INFO CARD */}
            <View style={[styles.userCard, { backgroundColor: theme.card }]}>
              <Pressable
                style={styles.avatarContainer}
                onPress={() => setAvatarPreviewVisible(true)}
              >
                {currentUser?.avatar_url ? (
                  currentUser.avatar_url.startsWith("http") ? (
                    <Image
                      source={{ uri: currentUser.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <SupabaseImage
                      path={currentUser.avatar_url}
                      bucket="avatars"
                      style={styles.avatar}
                    />
                  )
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{userInitials}</Text>
                  </View>
                )}
              </Pressable>
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
              <Pressable
                style={[
                  styles.tab,
                  activeTab === "bookmarked" && styles.activeTab,
                  {
                    backgroundColor:
                      activeTab === "bookmarked" ? theme.card : "transparent",
                  },
                ]}
                onPress={() => setActiveTab("bookmarked")}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color:
                        activeTab === "bookmarked"
                          ? theme.text
                          : theme.secondaryText,
                    },
                  ]}
                >
                  Bookmarked
                </Text>
              </Pressable>
            </View>
          </>
        }
        data={filteredPosts}
        renderItem={renderPostItem}
        keyExtractor={(item) => ("post_id" in item ? item.post_id : item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetchProfile();
              refetchPosts();
              refetchBookmarks();
              refetchVotes();
              refetchComments();
            }}
            tintColor={theme.primary}
          />
        }
        onEndReached={() => {
          if (
            activeTab !== "bookmarked" &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
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
                onPress={() => {
                  setSettingsVisible(false);
                  setNotificationsVisible(true);
                }}
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

              {/* Manage Account */}
              <Pressable
                style={[styles.settingRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  setSettingsVisible(false);
                  setManageAccountVisible(true);
                }}
              >
                <View style={styles.settingLeft}>
                  <MaterialCommunityIcons
                    name="account-cog"
                    size={22}
                    color={theme.text}
                  />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>
                    Manage Account
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.secondaryText}
                />
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Manage Account Modal */}
      <ManageAccountModal
        visible={manageAccountVisible}
        onClose={() => setManageAccountVisible(false)}
        onLogout={signOut}
        onDeleteAccount={handleDeleteAccount}
        onUnblockAll={handleUnblockAll}
        onUpdateAvatar={handleAvatarUpdate}
        onUpdateUsername={handleUsernameUpdate}
        onUpdatePassword={handlePasswordUpdate}
        isDeleting={deleteAccountMutation.isPending}
        isUnblocking={unblockAllMutation.isPending}
        isUpdating={
          updateProfileMutation.isPending || updatePasswordMutation.isPending
        }
        currentUsername={currentUser?.username || ""}
      />

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
      />

      {/* Avatar Preview Modal */}
      <Modal
        visible={avatarPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarPreviewVisible(false)}
      >
        <Pressable
          style={styles.avatarPreviewOverlay}
          onPress={() => setAvatarPreviewVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {currentUser?.avatar_url ? (
              currentUser.avatar_url.startsWith("http") ? (
                <Image
                  source={{ uri: currentUser.avatar_url }}
                  style={styles.avatarPreview}
                />
              ) : (
                <SupabaseImage
                  path={currentUser.avatar_url}
                  bucket="avatars"
                  style={styles.avatarPreview}
                />
              )
            ) : (
              <View style={styles.avatarPreview}>
                <Text style={styles.avatarPreviewText}>{userInitials}</Text>
              </View>
            )}
          </Pressable>
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
    marginRight: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#5DBEBC",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 40,
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
  avatarPreviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPreview: {
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#5DBEBC",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPreviewText: {
    fontSize: 120,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
  },
});
