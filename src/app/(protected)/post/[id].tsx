import { useState, useRef, useMemo, useCallback } from "react";
import { useLocalSearchParams, router, Stack } from "expo-router";
import {
  Text,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReportModal from "../../../components/ReportModal";
import BlockUserModal from "../../../components/BlockUserModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, AntDesign, Entypo } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { useAuth } from "../../../context/AuthContext";
import { Database } from "../../../types/database.types";
import { supabase } from "../../../lib/supabase";
import { ErrorBoundary } from "react-error-boundary";
import { logger } from "../../../utils/logger";
import { useBlocks } from "../../../hooks/useBlocks";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { usePostComments } from "../../../features/comments/hooks/usePostComments";
import type { CommentNode } from "../../../features/comments/utils/tree";
import { useCreateComment } from "../../../features/comments/hooks/useCreateComment";
import { useProfileById } from "../../../features/profile/hooks/useProfileById";
import { useBookmarkToggle } from "../../../features/posts/hooks/useBookmarkToggle";
import { useDeletePost } from "../../../features/posts/hooks/useDeletePost";
import { useReportPost } from "../../../features/posts/hooks/useReportPost";
import { useBlockUser } from "../../../features/posts/hooks/useBlockUser";
import { CommentsTreeList } from "../../../features/comments/components/CommentsTreeList";
import { CommentComposer } from "../../../features/comments/components/CommentComposer";
import { PostHeaderCard } from "../../../features/posts/components/PostHeaderCard";

export default function PostDetailed() {
  const { id, fromDeeplink } = useLocalSearchParams<{ id: string; fromDeeplink?: string }>();
  const postId = typeof id === "string" ? id : id?.[0];
  const isFromDeeplink = fromDeeplink === "1";
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [commentText, setCommentText] = useState<string>("");
  const [parentCommentId, setParentCommentId] = useState<string | null>(null);
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(
    null
  );
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [isAnonymousMode, setIsAnonymousMode] = useState(true);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const commentsListRef = useRef<FlatList<CommentNode> | null>(null);

  // Get current user ID
  const currentUserId = session?.user?.id || null;

  // Fetch blocked users via shared hook
  const { data: blocks = [] } = useBlocks();

  // 1. Fetch Post Details (using view to get repost data)
  const {
    data: detailedPost,
    isLoading: isPostLoading,
    error: postError,
  } = useQuery<PostsSummaryViewRow | null>({
    queryKey: ["post", postId],
    enabled: Boolean(postId),
    queryFn: async () => {
      if (!postId) return null;
      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .eq("post_id", postId)
        .limit(1);
      if (error) throw error;
      const row = data && data.length > 0 ? data[0] : null;
      if (!row) return null;
      return row as PostsSummaryViewRow;
    },
    staleTime: 1000 * 60 * 5, // Post stays fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  });

  // 2. Fetch Post Author
  const {
    data: postUser,
    isLoading: isUserLoading,
    error: userError,
  } = useProfileById(detailedPost?.user_id ?? null);

  // 3. Comments via shared hook (flat + tree), with blocked filtering
  const {
    flatComments,
    treeComments,
    isLoading: isCommentsLoading,
    error: commentsError,
    refetch: refetchComments,
    isRefetching: isRefetchingComments,
  } = usePostComments(postId, currentUserId, blocks);

  const nestedComments: CommentNode[] = treeComments;

  // Fetch bookmarks for this post
  const { data: postBookmarks = [] } = useQuery<
    Database["public"]["Tables"]["bookmarks"]["Row"][]
  >({
    queryKey: ["bookmarks", postId],
    enabled: Boolean(postId),
    queryFn: async () => {
      if (!postId) return [];
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("post_id", postId);
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60, // Bookmarks stay fresh for 1 minute
    gcTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
  });

  // Calculate if current user has bookmarked this post
  const isBookmarked = useMemo(() => {
    if (!currentUserId) return false;
    return postBookmarks.some((b) => b.user_id === currentUserId);
  }, [postBookmarks, currentUserId]);

  const createCommentMutation = useCreateComment({
    postId,
    viewerId: currentUserId,
  });

  const deletePostMutation = useDeletePost(postId);

  const handleDeletePost = () => {
    setShowMenu(false);

    Alert.alert(
      "Delete Post",
      "Are you sure you want to delete this post? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePostMutation.mutate(),
        },
      ]
    );
  };

  const bookmarkMutation = useBookmarkToggle({
    postId,
    viewerId: currentUserId,
  });

  const toggleBookmark = () => {
    bookmarkMutation.mutate(!isBookmarked);
  };

  const reportPostMutation = useReportPost({
    postId,
    viewerId: currentUserId,
  });

  const blockUserMutation = useBlockUser(currentUserId);

  const handleReportPost = (reason: string) => {
    setShowReportModal(false);
    setShowMenu(false);
    reportPostMutation.mutate(reason);
  };

  const handleBlockUser = () => {
    if (!detailedPost?.user_id) return;

    Alert.alert(
      "Block User",
      "Are you sure you want to block this user? You will no longer see their posts or comments, and they will no longer see yours.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setShowBlockModal(false),
        },
        {
          text: "Block",
          style: "destructive",
          onPress: () => blockUserMutation.mutate(detailedPost.user_id),
        },
      ]
    );
  };

  const handleReplyPress = (commentId: string) => {
    // Find the comment to get the username
    const findComment = (
      comments: CommentNode[]
    ): CommentNode | null => {
      for (const comment of comments) {
        if (comment.id === commentId) {
          return comment;
        }
        if (comment.replies && comment.replies.length > 0) {
          const found = findComment(comment.replies);
          if (found) return found;
        }
      }
      return null;
    };

    const targetComment = findComment(nestedComments);
    if (targetComment) {
      setParentCommentId(commentId);

      let label: string;
      if (targetComment.is_anonymous) {
        const anonId =
          (targetComment as any).post_specific_anon_id ??
          (targetComment as any).post_specific_anon_id;
        label =
          typeof anonId === "number" && anonId > 0
            ? `User ${anonId}`
            : "Anonymous";
      } else {
        const name = targetComment.user?.username || "Unknown";
        label = name.length > 15 ? `${name.slice(0, 15)}...` : name;
      }

      setReplyingToUsername(label);
      inputRef.current?.focus();
    }
  };

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    if (!currentUserId) {
      Alert.alert("Error", "You must be logged in to post a comment");
      return;
    }
    const content = commentText;
    const parentId = parentCommentId;
    const isAnonymous = isAnonymousMode;
    // Clear input and reply state immediately so UI updates before request
    setCommentText("");
    setParentCommentId(null);
    setReplyingToUsername(null);
    inputRef.current?.blur();
    createCommentMutation.mutate({ content, parentId, isAnonymous });
  };

  const handleCancelReply = () => {
    setParentCommentId(null);
    setReplyingToUsername(null);
    setCommentText("");
    setIsAnonymousMode(true);
  };

  const handleCommentDeleteStart = useCallback((commentId: string) => {
    setDeletingCommentId(commentId);
  }, []);
  const handleCommentDeleteEnd = useCallback(() => {
    setDeletingCommentId(null);
  }, []);

  const isLoading = isPostLoading || isUserLoading || isCommentsLoading;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (postError || userError || commentsError) {
    if (postError) logger.error("Failed to load post", postError as Error, { postId });
    if (userError) logger.error("Failed to load post user", userError as Error, { postId });
    if (commentsError) logger.error("Failed to load comments", commentsError as Error, { postId });

    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          {isFromDeeplink ? "This post isn't available right now." : "Failed to load content."}
        </Text>
        <Pressable
          style={[styles.backToFeedButton, { backgroundColor: theme.primary }]}
          onPress={() => router.replace("/(protected)/(tabs)")}
        >
          <Text style={styles.backToFeedButtonText}>Back to feed</Text>
        </Pressable>
      </View>
    );
  }

  if (!detailedPost) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          {isFromDeeplink ? "This post isn't available." : "Post Not Found!"}
        </Text>
        <Pressable
          style={[styles.backToFeedButton, { backgroundColor: theme.primary }]}
          onPress={() => router.replace("/(protected)/(tabs)")}
        >
          <Text style={styles.backToFeedButtonText}>Back to feed</Text>
        </Pressable>
      </View>
    );
  }

  // Check if post author is blocked
  const isPostAuthorBlocked = blocks.includes(detailedPost.user_id);
  // Check if reposted post's original author is blocked
  const isRepostAuthorBlocked = detailedPost.original_user_id
    ? blocks.includes(detailedPost.original_user_id)
    : false;

  // Hide post if author or repost author is blocked
  if (isPostAuthorBlocked || isRepostAuthorBlocked) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          {isFromDeeplink ? "This post isn't available." : "Post Not Found!"}
        </Text>
        <Pressable
          style={[styles.backToFeedButton, { backgroundColor: theme.primary }]}
          onPress={() => router.replace("/(protected)/(tabs)")}
        >
          <Text style={styles.backToFeedButtonText}>Back to feed</Text>
        </Pressable>
      </View>
    );
  }

  // Check if current user owns this post
  const isPostOwner = session?.user?.id === detailedPost?.user_id;

  const content = (
    <>
      <Stack.Screen
        options={{
          headerTitle: "",
          headerStyle: { backgroundColor: theme.primary },
          headerLeft: () => (
            <AntDesign
              style={{ marginLeft: 5 }}
              name="close"
              size={24}
              color="white"
              onPress={() => router.back()}
            />
          ),
          headerRight: () => (
            <Pressable onPress={() => setShowMenu(true)}>
              <Entypo name="dots-three-horizontal" size={24} color="white" style={{ marginLeft: 5 }} />
            </Pressable>
          ),
        }}
      />

      {/* Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMenu(false)}
        >
          <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
            {isPostOwner ? (
              <Pressable style={styles.menuItem} onPress={handleDeletePost}>
                <MaterialCommunityIcons
                  name="delete"
                  size={20}
                  color="#EF4444"
                />
                <Text style={[styles.menuText, { color: "#EF4444" }]}>
                  Delete Post
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowReportModal(true);
                }}
              >
                <MaterialCommunityIcons
                  name="flag"
                  size={20}
                  color={theme.text}
                />
                <Text style={[styles.menuText, { color: theme.text }]}>
                  Report Content
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Report Modal */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReportPost}
        isLoading={reportPostMutation.isPending}
        reportType="post"
      />

      {/* Block User Modal */}
      <BlockUserModal
        visible={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        onBlock={handleBlockUser}
        isLoading={blockUserMutation.isPending}
        username={
          detailedPost?.is_anonymous
            ? detailedPost?.user_id === currentUserId
              ? "You"
              : "Anonymous"
            : detailedPost?.username || "User"
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: theme.background }}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : insets.top}
      >
        <View style={{ flex: 1 }}>
          {(createCommentMutation.isPending || deletingCommentId) && (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                  zIndex: 10,
                  justifyContent: "center",
                  alignItems: "center",
                },
              ]}
              pointerEvents="box-only"
            >
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          )}
          <CommentsTreeList
            data={nestedComments}
            onReply={handleReplyPress}
            onDeleteStart={handleCommentDeleteStart}
            onDeleteEnd={handleCommentDeleteEnd}
            isRefetching={isRefetchingComments}
            onRefresh={refetchComments}
            listRef={commentsListRef}
            style={{ flex: 1 }}
            headerComponent={
              <PostHeaderCard
                post={detailedPost}
                postUser={postUser ?? null}
                commentCount={flatComments.length || 0}
                isBookmarked={isBookmarked}
                onToggleBookmark={toggleBookmark}
              />
            }
          />

          <CommentComposer
            theme={theme}
            insetsTop={insets.top}
            commentText={commentText}
            onChangeText={setCommentText}
            onSubmit={handlePostComment}
            onCancelReply={handleCancelReply}
            isAnonymousMode={isAnonymousMode}
            onToggleAnonymous={() => setIsAnonymousMode((prev) => !prev)}
            replyingToUsername={replyingToUsername}
            isSubmitting={createCommentMutation.isPending}
            currentUserLabel={
              session?.user?.user_metadata?.username || "You"
            }
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );

  return (
    <ErrorBoundary
      FallbackComponent={PostErrorFallback}
      onReset={() => {
        // Retry loading post
        queryClient.invalidateQueries({ queryKey: ["post", postId] });
        queryClient.invalidateQueries({
          queryKey: ["comments", postId, currentUserId],
        });
      }}
    >
      {content}
    </ErrorBoundary>
  );
}

function PostErrorFallback() {
  const { theme, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.errorText, { color: theme.text }]}>
        Something went wrong
      </Text>
      <Pressable
        style={[styles.backToFeedButton, { backgroundColor: theme.primary }]}
        onPress={() => router.replace("/(protected)/(tabs)")}
      >
        <Text style={styles.backToFeedButtonText}>Back to feed</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    marginBottom: 16,
  },
  backToFeedButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backToFeedButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
  inputContainer: {
    borderTopWidth: 1,
    padding: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 10,
    width: "100%",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  input: {
    flex: 1,
    padding: 12,
    borderRadius: 20,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    minHeight: 40,
    maxHeight: 100,
  },
  replyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2, // Align visually with input
  },
  replyIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    backgroundColor: "transparent",
  },
  replyIndicatorText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  cancelReplyButton: {
    padding: 4,
  },
  modalOverlay: {
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
  anonymousToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  anonymousToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  anonymousText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
});
