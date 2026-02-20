import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import LostFoundListItem, {
  type LostFoundPostForMenu,
} from "../../../components/LostFoundListItem";
import LostFoundListSkeleton from "../../../components/LostFoundListSkeleton";
import ReportModal from "../../../components/ReportModal";
import BlockUserModal from "../../../components/BlockUserModal";
import CustomInput from "../../../components/CustomInput";
import { router } from "expo-router";
import { FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import { useInfiniteQuery, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Database } from "../../../types/database.types";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { useAuth } from "../../../context/AuthContext";
import { useDeletePost } from "../../../features/posts/hooks/useDeletePost";
import { useMyProfile } from "../../../features/profile/hooks/useMyProfile";

const SEARCH_DEBOUNCE_MS = 300;

type PostSummary = PostsSummaryViewRow;

const POSTS_PER_PAGE = 10;

export default function LostFoundScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  const [selectedPost, setSelectedPost] = useState<LostFoundPostForMenu | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: currentUser } = useMyProfile(currentUserId);
  const isAdmin = currentUser?.is_admin === true;
  const isPostOwner = selectedPost && currentUserId === selectedPost.userId;
  const canDeletePost = isPostOwner || isAdmin;

  const isCreatingPost = useIsMutating({ mutationKey: ["create-post"] }) > 0;

  // Debounce search input to avoid filtering on every keystroke
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
      debounceRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

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
        .or("is_banned.is.null,is_banned.eq.false")
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

    // Filter out posts from blocked users (but keep anonymous posts visible)
    return uniquePosts.filter((post) => {
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
  }, [postsData, blocks]);

  // Filter by search: match content, category, or location (single pass, case-insensitive)
  const filteredPosts = useMemo(() => {
    if (!debouncedQuery) return lostFoundPosts;
    const q = debouncedQuery;
    return lostFoundPosts.filter((post) => {
      const content = (post.content ?? "").toLowerCase();
      const category = (post.category ?? "").toLowerCase();
      const location = (post.location ?? "").toLowerCase();
      return content.includes(q) || category.includes(q) || location.includes(q);
    });
  }, [lostFoundPosts, debouncedQuery]);

  const deletePostMutation = useDeletePost(undefined, {
    onSuccess: () => {
      setShowMenu(false);
      setSelectedPost(null);
    },
  });

  const handleDeletePost = useCallback(() => {
    if (!selectedPost) return;
    setShowMenu(false);
    Alert.alert(
      "Delete Post",
      "Are you sure you want to delete this post? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePostMutation.mutate(selectedPost.postId),
        },
      ]
    );
  }, [selectedPost, deletePostMutation]);

  // Report post mutation
  const reportPostMutation = useMutation({
    mutationFn: async ({ postId, reason }: { postId: string; reason: string }) => {
      if (!currentUserId) throw new Error("User ID missing");
      const { error } = await supabase.from("reports").insert({
        reporter_id: currentUserId,
        post_id: postId,
        comment_id: null,
        reason,
      });
      if (error) throw error;
    },
    onSuccess: (_, { postId }) => {
      setShowReportModal(false);
      setShowMenu(false);
      setShowBlockModal(true);
    },
    onError: (error: unknown) => {
      Alert.alert("Error", (error as Error)?.message ?? "Failed to submit report");
    },
  });

  const handleReportPost = useCallback(
    (reason: string) => {
      if (!selectedPost) return;
      reportPostMutation.mutate({ postId: selectedPost.postId, reason });
    },
    [selectedPost, reportPostMutation]
  );

  // Block user mutation (after report)
  const blockUserMutation = useMutation({
    mutationFn: async (userIdToBlock: string) => {
      if (!currentUserId) throw new Error("User ID missing");
      const { error } = await supabase.from("blocks").insert({
        blocker_id: currentUserId,
        blocked_id: userIdToBlock,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowBlockModal(false);
      setSelectedPost(null);
      queryClient.invalidateQueries({ queryKey: ["blocks", currentUserId] });
      queryClient.invalidateQueries({ queryKey: ["posts", "lost_found"] });
    },
    onError: (error: unknown) => {
      Alert.alert("Error", (error as Error)?.message ?? "Failed to block user");
    },
  });

  const handleBlockUser = useCallback(() => {
    if (!selectedPost) return;
    Alert.alert(
      "Block User",
      "Are you sure you want to block this user? You will no longer see their posts and they will no longer see yours.",
      [
        { text: "Cancel", style: "cancel", onPress: () => setShowBlockModal(false) },
        {
          text: "Block",
          style: "destructive",
          onPress: () => blockUserMutation.mutate(selectedPost.userId),
        },
      ]
    );
  }, [selectedPost, blockUserMutation]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Memoize keyExtractor
  const keyExtractor = useCallback((item: PostSummary) => item.post_id, []);

  // Open menu on long-press (delete own post / report other's content)
  const handleItemLongPress = useCallback((post: LostFoundPostForMenu) => {
    setSelectedPost(post);
    setShowMenu(true);
  }, []);

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
        onLongPress={handleItemLongPress}
      />
    ),
    [handleItemLongPress]
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
      {/* Menu Modal (long-press: Delete own / Report other) */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          style={menuStyles.overlay}
          onPress={() => setShowMenu(false)}
        >
          <View style={[menuStyles.menuContainer, { backgroundColor: theme.card }]}>
            {canDeletePost ? (
              <Pressable style={menuStyles.menuItem} onPress={handleDeletePost}>
                <MaterialCommunityIcons name="delete" size={20} color="#EF4444" />
                <Text style={[menuStyles.menuText, { color: "#EF4444" }]}>
                  Delete Post
                </Text>
              </Pressable>
            ) : null}
            {!isPostOwner ? (
              <Pressable
                style={menuStyles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowReportModal(true);
                }}
              >
                <MaterialCommunityIcons name="flag" size={20} color={theme.text} />
                <Text style={[menuStyles.menuText, { color: theme.text }]}>
                  Report Content
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReportPost}
        isLoading={reportPostMutation.isPending}
        reportType="post"
      />

      <BlockUserModal
        visible={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        onBlock={handleBlockUser}
        isLoading={blockUserMutation.isPending}
        username={selectedPost?.username ?? "User"}
      />

      <FlatList
        data={filteredPosts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={true}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={150}
        initialNumToRender={6}
        windowSize={10}
        ListHeaderComponent={
          <View style={styles.searchHeader}>
            <CustomInput
              placeholder="Search by item, location, lost or found..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              leftIcon={{ type: "font-awesome", name: "search" }}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
        }
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
                {debouncedQuery
                  ? "No results for your search"
                  : "No lost & found posts yet"}
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

      {/* Loading overlay while a lost&found post is being submitted */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchInput: {
    marginBottom: 8,
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

const menuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    borderRadius: 12,
    padding: 8,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  menuText: {
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
});
