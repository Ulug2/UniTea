import { useState, useRef, useMemo, useCallback, useEffect, type ReactNode } from "react";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import {
  Animated,
  Text,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReportModal from "../../../components/ReportModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, AntDesign, Entypo } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { useAuth } from "../../../context/AuthContext";
import { Database } from "../../../types/database.types";
import { supabase } from "../../../lib/supabase";
import { ErrorBoundary } from "react-error-boundary";
import { logger } from "../../../utils/logger";
import {
  useBlocks,
  isBlockedPost,
  hasBlockForScope,
} from "../../../hooks/useBlocks";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { usePostComments } from "../../../features/comments/hooks/usePostComments";
import type { CommentNode } from "../../../features/comments/utils/tree";
import { useCreateComment } from "../../../features/comments/hooks/useCreateComment";
import { useProfileById } from "../../../features/profile/hooks/useProfileById";
import { useMyProfile } from "../../../features/profile/hooks/useMyProfile";
import { useBookmarkToggle } from "../../../features/posts/hooks/useBookmarkToggle";
import { useDeletePost } from "../../../features/posts/hooks/useDeletePost";
import { useReportPost } from "../../../features/posts/hooks/useReportPost";
import { useBlockUser } from "../../../features/posts/hooks/useBlockUser";
import { useFilterContext } from "../../../context/FilterContext";
import { CommentsTreeList } from "../../../features/comments/components/CommentsTreeList";
import { CommentComposer } from "../../../features/comments/components/CommentComposer";
import { PostHeaderCard } from "../../../features/posts/components/PostHeaderCard";
import { FullscreenImageModal } from "../../../components/FullscreenImageModal";

export default function PostDetailed() {
  const { id, fromDeeplink } = useLocalSearchParams<{
    id: string;
    fromDeeplink?: string;
  }>();
  const postId = typeof id === "string" ? id : id?.[0];
  const isFromDeeplink = fromDeeplink === "1";
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [commentText, setCommentText] = useState<string>("");
  const [parentCommentId, setParentCommentId] = useState<string | null>(null);
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(
    null,
  );
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isAnonymousMode, setIsAnonymousMode] = useState(true);
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  );
  const inputRef = useRef<TextInput | null>(null);
  const commentsListRef = useRef<FlatList<CommentNode> | null>(null);
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  // On iOS, insets.bottom must be removed from the composer while the keyboard
  // is visible — the keyboard already covers the home-indicator zone, and keeping
  // the inset creates a visible 34-px dead gap above the keyboard.
  const [iosKeyboardOpen, setIosKeyboardOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === "android") {
      const show = Keyboard.addListener("keyboardDidShow", (e) => {
        setAndroidKeyboardInset(e.endCoordinates.height);
      });
      const hide = Keyboard.addListener("keyboardDidHide", () => {
        setAndroidKeyboardInset(0);
      });
      return () => {
        show.remove();
        hide.remove();
      };
    }

    // iOS: use *Will* events so the padding change is synchronised with the
    // keyboard animation rather than snapping after it finishes.
    const show = Keyboard.addListener("keyboardWillShow", () =>
      setIosKeyboardOpen(true),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () =>
      setIosKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const { height: screenHeight } = useWindowDimensions();
  const slideAnim = useRef(
    new Animated.Value(Platform.OS === "android" ? screenHeight : 0),
  ).current;
  const isExiting = useRef(false);

  const closeScreen = useCallback(() => {
    if (Platform.OS !== "android") {
      router.back();
      return;
    }
    if (isExiting.current) return;
    isExiting.current = true;
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      router.back();
    });
  }, [screenHeight, slideAnim]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeScreen();
      return true;
    });
    return () => sub.remove();
  }, [closeScreen]);

  const androidWrapperStyle =
    Platform.OS === "android"
      ? [{ flex: 1 }, { transform: [{ translateY: slideAnim }] }]
      : { flex: 1 };

  // Wraps any content in the Android slide-animation container.
  // Available before all early returns so every render path is animated.
  const wrapScreen = (inner: ReactNode) =>
    Platform.OS === "android" ? (
      <Animated.View style={androidWrapperStyle}>{inner}</Animated.View>
    ) : (
      <View style={{ flex: 1 }}>{inner}</View>
    );

  // Screen chrome: Stack.Screen config + custom Android header.
  // Defined before data-dependent early returns so the header always renders
  // regardless of loading / error state.
  const screenChrome = (
    <>
      <Stack.Screen
        options={{
          headerShown: Platform.OS !== "android",
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
              <Entypo
                name="dots-three-horizontal"
                size={24}
                color="white"
                style={{ marginLeft: 5 }}
              />
            </Pressable>
          ),
        }}
      />
      {Platform.OS === "android" && (
        <View style={{ backgroundColor: theme.primary, paddingTop: insets.top }}>
          <View
            style={{
              height: 56,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              justifyContent: "space-between",
            }}
          >
            <AntDesign
              name="close"
              size={24}
              color="white"
              onPress={closeScreen}
            />
            <Pressable onPress={() => setShowMenu(true)}>
              <Entypo
                name="dots-three-horizontal"
                size={24}
                color="white"
              />
            </Pressable>
          </View>
        </View>
      )}
    </>
  );

  // Get current user ID
  const currentUserId = session?.user?.id || null;
  const { hidePost } = useFilterContext();

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
        .or("is_banned.is.null,is_banned.eq.false")
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
  } = useProfileById(detailedPost?.user_id ?? undefined);

  const { data: currentUser } = useMyProfile(currentUserId ?? undefined);
  const isAdmin = currentUser?.is_admin === true;

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

  // Keep a fresh ref so handleReplyPress can be a stable callback ([] deps)
  // while always reading the latest comment tree.
  const nestedCommentsRef = useRef(nestedComments);
  nestedCommentsRef.current = nestedComments;

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

  const deletePostMutation = useDeletePost(postId, {
    onNavigateBack: closeScreen,
  });

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
          onPress: () => deletePostMutation.mutate(undefined),
        },
      ],
    );
  };

  const bookmarkMutation = useBookmarkToggle({
    postId,
    viewerId: currentUserId,
  });

  const toggleBookmark = useCallback(() => {
    bookmarkMutation.mutate(!isBookmarked);
  }, [bookmarkMutation, isBookmarked]);

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

    const isAnon = detailedPost.is_anonymous ?? false;
    const scope = isAnon ? "anonymous_only" : "profile_only";
    const message = isAnon
      ? "You will no longer see anonymous posts from this user."
      : "You will no longer see public posts or receive messages from this user.";

    Alert.alert("Block User", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: () =>
          blockUserMutation.mutate(
            { targetUserId: detailedPost.user_id, scope },
            { onSuccess: () => closeScreen() },
          ),
      },
    ]);
  };

  // Stable callback: reads nestedComments via ref so it never needs to be
  // recreated when the comment tree refreshes. This prevents CommentsTreeList
  // and every CommentListItem from re-rendering on each parent re-render
  // (e.g. every keystroke in the comment input).
  const handleReplyPress = useCallback((commentId: string) => {
    const findComment = (comments: CommentNode[]): CommentNode | null => {
      for (const comment of comments) {
        if (comment.id === commentId) return comment;
        if (comment.replies?.length) {
          const found = findComment(comment.replies);
          if (found) return found;
        }
      }
      return null;
    };

    const targetComment = findComment(nestedCommentsRef.current);
    if (targetComment) {
      setParentCommentId(commentId);

      let label: string;
      if (targetComment.is_anonymous) {
        const anonId = (targetComment as any).post_specific_anon_id;
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
  }, []);

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

  // Stable header element — only recreates when post data or bookmark state
  // changes, NOT on every comment-input keystroke.
  const postHeaderComponent = useMemo(
    () => (
      <PostHeaderCard
        post={detailedPost!}
        postUser={postUser ?? null}
        commentCount={flatComments.length || 0}
        isBookmarked={isBookmarked}
        onToggleBookmark={toggleBookmark}
        onImagePress={setFullscreenUri}
        isAdmin={isAdmin}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailedPost, postUser, flatComments.length, isBookmarked, toggleBookmark, isAdmin],
  );

  // Only gate on post/user loading — comments show an inline spinner via
  // CommentsTreeList so the header is always immediately visible.
  if (isPostLoading || isUserLoading) {
    return wrapScreen(
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {screenChrome}
        <View style={styles.container}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>,
    );
  }

  if (postError || userError || commentsError) {
    if (postError)
      logger.error("Failed to load post", postError as Error, { postId });
    if (userError)
      logger.error("Failed to load post user", userError as Error, { postId });
    if (commentsError)
      logger.error("Failed to load comments", commentsError as Error, {
        postId,
      });

    return wrapScreen(
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {screenChrome}
        <View style={styles.container}>
          <Text style={[styles.errorText, { color: theme.text }]}>
            {isFromDeeplink
              ? "This post isn't available right now."
              : "Failed to load content."}
          </Text>
          <Pressable
            style={[styles.backToFeedButton, { backgroundColor: theme.primary }]}
            onPress={() => router.replace("/(protected)/(tabs)")}
          >
            <Text style={styles.backToFeedButtonText}>Back to feed</Text>
          </Pressable>
        </View>
      </View>,
    );
  }

  if (!detailedPost) {
    return wrapScreen(
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {screenChrome}
        <View style={styles.container}>
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
      </View>,
    );
  }

  // Check if post author is blocked (scope-aware)
  const isPostAuthorBlocked = isBlockedPost(
    blocks,
    detailedPost.user_id,
    detailedPost.is_anonymous ?? false,
  );
  // Check if reposted post's original author is blocked (scope-aware)
  const isRepostAuthorBlocked = detailedPost.original_user_id
    ? isBlockedPost(
      blocks,
      detailedPost.original_user_id,
      detailedPost.original_is_anonymous ?? false,
    )
    : false;

  // Hide post if author or repost author is blocked
  if (isPostAuthorBlocked || isRepostAuthorBlocked) {
    return wrapScreen(
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {screenChrome}
        <View style={styles.container}>
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
      </View>,
    );
  }

  // Check if current user owns this post or is admin
  const isPostOwner = session?.user?.id === detailedPost?.user_id;
  const canDeletePost = isPostOwner || isAdmin;

  // Determine whether the block option for this post's scope is already applied
  const postScope =
    (detailedPost?.is_anonymous ?? false) ? "anonymous_only" : "profile_only";
  const alreadyBlockedInScope = hasBlockForScope(
    blocks,
    detailedPost?.user_id,
    postScope,
  );

  const commentsScreenShellStyle = {
    flex: 1 as const,
    backgroundColor: theme.background,
  };

  const commentsScreenBody = (
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
        isLoading={isCommentsLoading}
        onRefresh={refetchComments}
        listRef={commentsListRef}
        style={styles.listFlex}
        isAdmin={isAdmin}
        headerComponent={postHeaderComponent}
      />

      <CommentComposer
        ref={inputRef}
        theme={theme}
        insetsBottom={Platform.OS === "ios" && iosKeyboardOpen ? 0 : insets.bottom}
        commentText={commentText}
        onChangeText={setCommentText}
        onSubmit={handlePostComment}
        onCancelReply={handleCancelReply}
        isAnonymousMode={isAnonymousMode}
        onToggleAnonymous={() => setIsAnonymousMode((prev) => !prev)}
        replyingToUsername={replyingToUsername}
        isSubmitting={createCommentMutation.isPending}
        currentUserLabel={session?.user?.user_metadata?.username || "You"}
      />
    </View>
  );

  const content = (
    <>
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
            {canDeletePost ? (
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
            ) : null}
            {!isPostOwner && postId ? (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  Alert.alert(
                    "Hide Post",
                    "This post will be removed from your feed.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Hide",
                        style: "destructive",
                        onPress: () => {
                          hidePost(postId);
                          closeScreen();
                        },
                      },
                    ],
                  );
                }}
              >
                <MaterialCommunityIcons
                  name="eye-off-outline"
                  size={20}
                  color={theme.text}
                />
                <Text style={[styles.menuText, { color: theme.text }]}>
                  Hide Post
                </Text>
              </Pressable>
            ) : null}
            {!isPostOwner ? (
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
            ) : null}
            {!isPostOwner && !alreadyBlockedInScope ? (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  handleBlockUser();
                }}
              >
                <MaterialCommunityIcons
                  name="block-helper"
                  size={20}
                  color={theme.text}
                />
                <Text style={[styles.menuText, { color: theme.text }]}>
                  {detailedPost?.is_anonymous
                    ? "Block Anonymous User"
                    : "Block User"}
                </Text>
              </Pressable>
            ) : null}
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

      <FullscreenImageModal
        visible={Boolean(fullscreenUri)}
        uri={fullscreenUri}
        onClose={() => setFullscreenUri(null)}
      />

      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          behavior="padding"
          style={commentsScreenShellStyle}
          keyboardVerticalOffset={headerHeight}
        >
          {commentsScreenBody}
        </KeyboardAvoidingView>
      ) : (
        <View
          style={[
            commentsScreenShellStyle,
            { paddingBottom: androidKeyboardInset },
          ]}
        >
          {commentsScreenBody}
        </View>
      )}
    </>
  );

  return (
    <ErrorBoundary
      FallbackComponent={PostErrorFallback}
      onReset={() => {
        queryClient.invalidateQueries({ queryKey: ["post", postId] });
        queryClient.invalidateQueries({
          queryKey: ["comments", postId, currentUserId],
        });
      }}
    >
      {wrapScreen(
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {screenChrome}
          {content}
        </View>,
      )}
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
  listFlex: {
    flex: 1,
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
