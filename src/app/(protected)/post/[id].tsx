import {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import {
  Animated,
  Easing,
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
  PixelRatio,
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
  hasBlockForScope,
} from "../../../hooks/useBlocks";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { usePostComments } from "../../../features/comments/hooks/usePostComments";
import type { CommentNode } from "../../../features/comments/utils/tree";
import { useCreateComment } from "../../../features/comments/hooks/useCreateComment";
import { useMyProfile } from "../../../features/profile/hooks/useMyProfile";
import { useBookmarkToggle } from "../../../features/posts/hooks/useBookmarkToggle";
import { useDeletePost } from "../../../features/posts/hooks/useDeletePost";
import { useReportPost } from "../../../features/posts/hooks/useReportPost";
import { useBlockUser } from "../../../features/posts/hooks/useBlockUser";
import { useFilterContext } from "../../../context/FilterContext";
import { CommentsTreeList } from "../../../features/comments/components/CommentsTreeList";
import { CommentComposer } from "../../../features/comments/components/CommentComposer";
import { PostHeaderCard } from "../../../features/posts/components/PostHeaderCard";
import { postDetailQueryOptions } from "../../../features/posts/data/postDetailQuery";
import { usePoll } from "../../../hooks/usePoll";
import { useRevealAfterFirstNImages } from "../../../hooks/useRevealAfterFirstNImages";
import { FullscreenImageModal } from "../../../components/FullscreenImageModal";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import { generateUuidV4 } from "../../../utils/uuid";
import {
  buildPostAuthorContext,
  resolvePostAuthorDisplay,
} from "../../../utils/entityDisplay";

export default function PostDetailed() {
  const { id, fromDeeplink } = useLocalSearchParams<{
    id: string;
    fromDeeplink?: string;
  }>();
  const postId = typeof id === "string" ? id : id?.[0];
  const isFromDeeplink = fromDeeplink === "1";
  const insets = useSafeAreaInsets();
  const fontScale = PixelRatio.getFontScale();
  const headerIconSize = moderateScale(24) * fontScale;
  const menuIconSize = moderateScale(20) * fontScale;
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
  // Idempotency key for comment creation (Phase 4). Mirrors create-post.tsx's
  // lastAttemptRef: the signature is built only from what the user actually
  // controls, so an unedited resubmission (the normal recovery path after a
  // failed/ambiguous send — draft preservation already keeps the text as-is)
  // reuses the same id, while an actual edit gets a fresh one instead of
  // silently colliding with the earlier, different-content attempt.
  const lastCommentAttemptRef = useRef<{ signature: string; id: string } | null>(
    null,
  );
  // Remove bottom safe-area inset while keyboard is open to avoid extra gap
  // between the keyboard and composer on both iOS and Android.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", () =>
      setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      // Use full IME height on Android; subtracting safe area can under-lift
      // the composer on some devices/navigation modes.
      const imeInset = Math.max(e.endCoordinates.height + insets.bottom, 0);
      setAndroidKeyboardInset(imeInset);
      setKeyboardOpen(true);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardInset(0);
      setKeyboardOpen(false);
    });
    return () => {
      show.remove();
      hide.remove();
      setAndroidKeyboardInset(0);
    };
  }, []);

  const { height: screenHeight } = useWindowDimensions();
  const slideAnim = useRef(
    new Animated.Value(Platform.OS === "android" ? screenHeight : 0),
  ).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isExiting = useRef(false);

  // Community id mirror for navigateBack (Phase 3.1C). navigateBack is
  // defined here, before the post query below resolves, so it can't close
  // over `detailedPost` directly without being redefined (and therefore
  // redefining closeScreen/the BackHandler listener) on every post-data
  // change. Written to synchronously during render (not in an effect) since
  // it's only ever read inside the navigateBack event handler, never during
  // render — the standard "stable callback wants the latest value" pattern.
  const communityIdRef = useRef<string | null>(null);

  // Safe back navigation.
  //
  // Organic in-app navigation (Community View → Post Detail, Campus Feed →
  // Post Detail, etc.) always prefers router.back() so the user returns to
  // the exact screen they came from.
  //
  // External entry (push notification, shared link, deep link — all share
  // the existing `fromDeeplink` signal, see +native-intent.ts and
  // usePushNotifications.ts) cannot trust the back stack: Expo Router can
  // synthesize a stack under a deep-linked screen, so router.canGoBack()
  // may report true even though there's no meaningful previous screen. For
  // external entry, derive the destination from the post itself instead —
  // its own community, or the Campus Feed if it isn't a community post.
  const navigateBack = useCallback(() => {
    if (!isFromDeeplink && router.canGoBack()) {
      router.back();
      return;
    }
    const communityId = communityIdRef.current;
    if (communityId) {
      router.replace(`/communities/${communityId}`);
    } else {
      router.replace("/(protected)/(tabs)");
    }
  }, [isFromDeeplink]);

  const closeScreen = useCallback(() => {
    if (Platform.OS !== "android") {
      navigateBack();
      return;
    }
    if (isExiting.current) return;
    isExiting.current = true;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 280,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      // Delay the fade so it only fires in the last ~60ms once the content
      // is almost off-screen. This avoids the "disappears too early" effect
      // while still eliminating the freeze-at-bottom-edge issue.
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 60,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      navigateBack();
    });
  }, [screenHeight, slideAnim, fadeAnim, navigateBack]);

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
      ? [
          { flex: 1 },
          { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
        ]
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
              style={{ marginLeft: scale(5) }}
              name="close"
              size={headerIconSize}
              color="white"
              onPress={closeScreen}
            />
          ),
          headerRight: () => (
            <Pressable onPress={() => setShowMenu(true)}>
              <Entypo
                name="dots-three-horizontal"
                size={headerIconSize}
                color="white"
                style={{ marginLeft: scale(5) }}
              />
            </Pressable>
          ),
        }}
      />
      {Platform.OS === "android" && (
        <View
          style={{ backgroundColor: theme.primary, paddingTop: insets.top }}
        >
          <View
            style={{
              height: verticalScale(56),
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: scale(16),
              justifyContent: "space-between",
            }}
          >
            <AntDesign
              name="close"
              size={headerIconSize}
              color="white"
              onPress={closeScreen}
            />
            <Pressable onPress={() => setShowMenu(true)}>
              <Entypo
                name="dots-three-horizontal"
                size={headerIconSize}
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

  // 1. Fetch Post Details (using view to get repost data). The view already
  // joins profiles (INNER JOIN), so username/avatar_url/is_verified always
  // come back on this same row — a separate author-profile fetch is
  // redundant and was removed (Phase 7.8).
  const {
    data: detailedPost,
    isLoading: isPostLoading,
    error: postError,
  } = useQuery<PostsSummaryViewRow | null>({
    ...postDetailQueryOptions(postId),
    enabled: Boolean(postId),
  });

  // Keep navigateBack's community fallback current — see communityIdRef's
  // declaration above for why this is a ref write during render rather than
  // a useEffect.
  communityIdRef.current = detailedPost?.community_id ?? null;

  // Snapshot, once, whether this exact post was already sitting in the React
  // Query cache when this screen mounted (e.g. prefetched on tap from a list
  // — see PostListItem's onPress handlers — or revisited within staleTime).
  // Captured via a lazy initializer so it reflects the state AT MOUNT only,
  // not on every render once the fetch itself resolves (which would always
  // read cache-hit-like by the time render happens) — see isMediaReady below.
  const [wasPostCachedOnMount] = useState(
    () =>
      queryClient.getQueryData<PostsSummaryViewRow | null>(["post", postId]) !=
      null,
  );

  // 2b. Poll readiness (Phase 7.2). PostListItem/Poll.tsx render
  // <Poll postId={repostedFromPostId ?? postId} /> — a repost's poll
  // belongs to the ORIGINAL post, not the repost itself. Mirror that same
  // id choice here so this check is for the exact poll (if any) that will
  // actually render below. Uses the same usePoll hook Poll.tsx itself
  // calls, so this is the same query (React Query dedupes it — no extra
  // network request), just subscribed to one level up so its pending state
  // can be folded into this screen's own "ready" gate below instead of
  // popping in after the post already looks fully loaded. enabled only
  // once detailedPost has resolved, so this never adds delay before that.
  const pollPostId = detailedPost
    ? (detailedPost.reposted_from_post_id ?? detailedPost.post_id)
    : undefined;
  const { isLoading: isPollLoading } = usePoll(pollPostId, currentUserId);

  // 2c. Image/avatar reveal gate (Phase 7.8) — mirrors the same
  // useRevealAfterFirstNImages hook the Home Feed and Lost & Found already
  // use. The header card below calls reportMediaReady() once its avatar and
  // all its images have loaded (PostListItem's onImageLoad contract), so the
  // screen only reveals once nothing in the initial view is still popping
  // in. minItems is 1 because the header renders as a single PostListItem
  // instance that reports readiness exactly once (not per-image). When the
  // post was already cached at mount (prefetched on tap, or revisited this
  // session), wasPostCachedOnMount skips the wait entirely — its images are
  // very likely already in expo-image's disk cache, same reasoning as the
  // feed's hasCachedPosts skip.
  const { shouldReveal: isMediaReady, onItemReady: reportMediaReady } =
    useRevealAfterFirstNImages({
      minItems: 1,
      timeoutMs: 2500,
      initialRevealed: wasPostCachedOnMount,
      resetKey: postId,
    });

  const { data: currentUser } = useMyProfile(currentUserId ?? undefined);
  const isAdmin = currentUser?.is_admin === true;

  const postAuthorContext = useMemo(
    () =>
      buildPostAuthorContext({
        isAnonymous: !!detailedPost?.is_anonymous,
        username: detailedPost?.username,
        avatarUrl: detailedPost?.avatar_url,
        universityDomain: detailedPost?.university_domain,
        communityId: detailedPost?.community_id,
        communityName: detailedPost?.community_name,
        communityAvatarUrl: detailedPost?.community_avatar_url,
        userId: detailedPost?.user_id,
        currentUserId,
      }),
    [detailedPost, currentUserId],
  );

  const anonymousCommentPreview = useMemo(
    () =>
      resolvePostAuthorDisplay({
        ...postAuthorContext,
        isAnonymous: true,
        isOwnPost: false,
      }),
    [postAuthorContext],
  );

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
    communityId: detailedPost?.community_id ?? null,
  });

  const deletePostMutation = useDeletePost(postId, {
    scope: { type: "feed", communityId: detailedPost?.community_id ?? null },
    onNavigateBack: closeScreen,
  });

  const handleDeletePost = () => {
    if (deletePostMutation.isPending) return;
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
    const authorId = detailedPost?.user_id;
    if (!authorId) return;

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
            { targetUserId: authorId, scope },
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

  const handlePostComment = async () => {
    if (!commentText.trim()) return;
    if (!currentUserId) {
      Alert.alert("Error", "You must be logged in to post a comment");
      return;
    }
    const content = commentText;
    const parentId = parentCommentId;
    const isAnonymous = isAnonymousMode;
    inputRef.current?.blur();

    // Resolve this attempt's idempotency id before submitting (Phase 4).
    // Same content/target/anonymity as the last attempt on this screen ->
    // reuse its id (a retry); anything different -> a fresh id (a genuinely
    // new comment).
    const attemptSignature = JSON.stringify({
      postId,
      content,
      parentId,
      isAnonymous,
    });
    let commentId: string;
    if (lastCommentAttemptRef.current?.signature === attemptSignature) {
      commentId = lastCommentAttemptRef.current.id;
    } else {
      commentId = generateUuidV4();
      lastCommentAttemptRef.current = { signature: attemptSignature, id: commentId };
    }

    try {
      // Awaited (not fire-and-forget) so the input/reply state below is only
      // cleared once the server has actually confirmed the comment was
      // created — previously the input was cleared immediately, so any
      // failure (network/server/rate-limit/session-expired) silently lost
      // whatever the user had typed. mutateAsync rejects instead of
      // resolving on failure; the existing overlay (createCommentMutation.
      // isPending, see commentsScreenBody above) already covers the screen
      // for this whole awaited window, so there's no responsiveness cost to
      // waiting instead of clearing eagerly.
      await createCommentMutation.mutateAsync({ id: commentId, content, parentId, isAnonymous });
      // Confirmed success — clear the retry memory so this screen instance
      // never reuses a spent id if it somehow submits again.
      lastCommentAttemptRef.current = null;
      setCommentText("");
      setParentCommentId(null);
      setReplyingToUsername(null);
    } catch (error) {
      // Errors are already surfaced via the mutation's own onError (Alert).
      // Intentionally leave commentText/parentCommentId/replyingToUsername
      // untouched so the user's draft and reply target survive a failure —
      // they can just retry.
    }
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
        commentCount={flatComments.length || 0}
        isBookmarked={isBookmarked}
        onToggleBookmark={toggleBookmark}
        onImagePress={setFullscreenUri}
        isAdmin={isAdmin}
        onImageLoad={reportMediaReady}
        imagesAssumeCached={wasPostCachedOnMount}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      detailedPost,
      flatComments.length,
      isBookmarked,
      toggleBookmark,
      isAdmin,
      reportMediaReady,
      wasPostCachedOnMount,
    ],
  );

  // Gate on post/user loading, plus the post's own poll (if it has one) —
  // comments still show their own inline spinner via CommentsTreeList
  // rather than gating here, since a missing comment LIST doesn't read as
  // "half loaded" the way a post that's visible-but-then-grows-a-poll-block
  // does (Phase 7.2: a poll changes layout/meaning significantly, so it's
  // worth the brief wait; comments are a distinct, expected-to-load-in
  // section, not something that makes the header look unfinished).
  // isPollLoading is only ever true while detailedPost is also still
  // loading (nothing to check yet) or while the SAME query Poll.tsx itself
  // needs is genuinely in flight — never an extra fetch, and already
  // resolved instantly whenever this post's poll was already seeded/cached.
  if (isPostLoading || isPollLoading) {
    return wrapScreen(
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {screenChrome}
        <View style={styles.container}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>,
    );
  }

  if (postError || commentsError) {
    if (postError)
      logger.error("Failed to load post", postError as Error, { postId });
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
            testID="post-detail-back-to-feed"
            style={[
              styles.backToFeedButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={closeScreen}
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
            testID="post-detail-back-to-feed"
            style={[
              styles.backToFeedButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={closeScreen}
          >
            <Text style={styles.backToFeedButtonText}>Back to feed</Text>
          </Pressable>
        </View>
      </View>,
    );
  }

  // Block detection is server-side in posts_summary_view (migration 20260628000004),
  // so these work correctly even for anonymous posts where user_id is redacted.
  const isPostAuthorBlocked = detailedPost.is_author_blocked_by_viewer === true;
  const isRepostAuthorBlocked =
    detailedPost.is_original_author_blocked_by_viewer === true;

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
            testID="post-detail-back-to-feed"
            style={[
              styles.backToFeedButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={closeScreen}
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
      {(createCommentMutation.isPending ||
        deletingCommentId ||
        deletePostMutation.isPending) && (
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
        postAuthorContext={postAuthorContext}
      />

      <CommentComposer
        ref={inputRef}
        theme={theme}
        insetsBottom={keyboardOpen ? 0 : insets.bottom}
        commentText={commentText}
        onChangeText={setCommentText}
        onSubmit={handlePostComment}
        onCancelReply={handleCancelReply}
        isAnonymousMode={isAnonymousMode}
        onToggleAnonymous={() => setIsAnonymousMode((prev) => !prev)}
        replyingToUsername={replyingToUsername}
        isSubmitting={createCommentMutation.isPending}
        currentUserLabel={session?.user?.user_metadata?.username || "You"}
        anonymousPreview={anonymousCommentPreview}
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
              <Pressable
                testID="post-detail-delete-item"
                style={[
                  styles.menuItem,
                  deletePostMutation.isPending && styles.menuItemDisabled,
                ]}
                onPress={handleDeletePost}
                disabled={deletePostMutation.isPending}
              >
                {deletePostMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <MaterialCommunityIcons
                    name="delete"
                    size={menuIconSize}
                    color="#EF4444"
                  />
                )}
                <Text style={[styles.menuText, { color: "#EF4444" }]}>
                  {deletePostMutation.isPending ? "Deleting…" : "Delete Post"}
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
                  size={menuIconSize}
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
                  size={menuIconSize}
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
                  size={menuIconSize}
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
          {/* Real content mounts immediately (even while media is still
              loading) so its avatar/image onLoad events can actually fire —
              an early-return here instead would mean nothing ever mounts to
              report readiness, and the screen would always sit at the
              timeout. Hidden via opacity/pointerEvents until
              reportMediaReady() (or the hook's own timeout) fires, matching
              the Home Feed/Lost & Found reveal pattern (Phase 7.8). */}
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, opacity: isMediaReady ? 1 : 0 }}>
              {content}
            </View>
            {/* Sits on top and opaquely covers the same area, so it already
                intercepts touches to the hidden content below by ordinary
                view stacking — no pointerEvents needed on the content
                wrapper itself. */}
            {!isMediaReady && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.container,
                  { backgroundColor: theme.background },
                ]}
              >
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            )}
          </View>
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
    fontSize: moderateScale(16),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    marginBottom: verticalScale(16),
  },
  backToFeedButton: {
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(8),
  },
  backToFeedButtonText: {
    color: "#fff",
    fontSize: moderateScale(16),
    fontFamily: "Poppins_500Medium",
  },
  inputContainer: {
    borderTopWidth: 1,
    padding: moderateScale(10),
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    shadowOffset: {
      width: 0,
      height: verticalScale(-3),
    },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(3),
    elevation: 10,
    width: "100%",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: moderateScale(10),
  },
  input: {
    flex: 1,
    padding: moderateScale(12),
    borderRadius: moderateScale(20),
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(15),
    minHeight: verticalScale(40),
    maxHeight: verticalScale(100),
  },
  replyButton: {
    minWidth: scale(40),
    minHeight: verticalScale(40),
    borderRadius: moderateScale(20),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: verticalScale(2), // Align visually with input
  },
  replyIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    marginBottom: verticalScale(8),
    backgroundColor: "transparent",
  },
  replyIndicatorText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
  },
  cancelReplyButton: {
    padding: moderateScale(4),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    borderRadius: moderateScale(12),
    padding: moderateScale(8),
    minWidth: scale(200),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: verticalScale(2),
    },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(3.84),
    elevation: 5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: moderateScale(12),
    gap: moderateScale(12),
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuText: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_500Medium",
  },
  anonymousToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    marginBottom: verticalScale(8),
  },
  anonymousToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(8),
  },
  toggleAvatar: {
    width: scale(20),
    height: verticalScale(20),
    borderRadius: moderateScale(10),
  },
  anonymousText: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_500Medium",
  },
});
