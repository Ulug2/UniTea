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
  RefreshControl,
  Modal,
  Switch,
  Image,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PostListItem from "../../../components/PostListItem";
import CommentListItem from "../../../components/CommentListItem";
import ReportModal from "../../../components/ReportModal";
import BlockUserModal from "../../../components/BlockUserModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MaterialCommunityIcons,
  AntDesign,
  Entypo,
  Ionicons,
} from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { useAuth } from "../../../context/AuthContext";
import { Database, TablesInsert } from "../../../types/database.types";
import { supabase } from "../../../lib/supabase";
import nuLogo from "../../../../assets/images/nu-logo.png";
import { ErrorBoundary } from "react-error-boundary";

type Post = Database["public"]["Tables"]["posts"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Vote = Database["public"]["Tables"]["votes"]["Row"];
type Bookmark = Database["public"]["Tables"]["bookmarks"]["Row"];

// Extended type to include the joined user profile and nested replies
type CommentWithReplies = Comment & {
  user: Profile | undefined;
  replies: CommentWithReplies[];
  score?: number;
};

export default function PostDetailed() {
  const { id } = useLocalSearchParams();
  const postId = typeof id === "string" ? id : id?.[0];
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
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
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

  // Get current user ID
  const currentUserId = session?.user?.id || null;

  // Fetch blocked users (must be before nestedComments useMemo)
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

  // 1. Fetch Post Details (using view to get repost data)
  const {
    data: detailedPost,
    isLoading: isPostLoading,
    error: postError,
  } = useQuery<any>({
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
      // Return first row if multiple exist (shouldn't happen but handles edge case)
      return data && data.length > 0 ? data[0] : null;
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
  } = useQuery<Profile | null>({
    queryKey: ["post-user", detailedPost?.user_id],
    enabled: Boolean(detailedPost?.user_id),
    queryFn: async () => {
      if (!detailedPost?.user_id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", detailedPost.user_id)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 30, // Profile stays fresh for 30 minutes
    gcTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 2,
  });

  // 3. Fetch Comments (Flat List)
  const {
    data: rawComments,
    isLoading: isCommentsLoading,
    error: commentsError,
    refetch: refetchComments,
    isRefetching: isRefetchingComments,
  } = useQuery<CommentWithReplies[]>({
    queryKey: ["comments", postId, currentUserId],
    enabled: Boolean(postId),
    queryFn: async () => {
      if (!postId) return [];

      // Fetch comments
      const { data: comments, error: commentsErr } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", postId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (commentsErr) throw commentsErr;
      if (!comments?.length) return [];

      // Get unique user IDs
      const userIds = [
        ...new Set(comments.map((c) => c.user_id).filter(Boolean)),
      ] as string[];

      // Fetch all comment authors in one query
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      const usersById = new Map(profiles?.map((u) => [u.id, u]) || []);

      // Fetch all votes for these comments in one query
      const commentIds = comments.map((c) => c.id);
      const { data: votes } = await supabase
        .from("votes")
        .select("comment_id, vote_type")
        .in("comment_id", commentIds);

      // Calculate score for each comment
      const scoreByCommentId = new Map<string, number>();
      votes?.forEach((vote) => {
        if (!vote.comment_id) return;
        const current = scoreByCommentId.get(vote.comment_id) || 0;
        scoreByCommentId.set(
          vote.comment_id,
          current + (vote.vote_type === "upvote" ? 1 : -1)
        );
      });

      // Map comments with user data
      return comments.map((c) => ({
        ...c,
        user: c.user_id ? usersById.get(c.user_id) : undefined,
        score: scoreByCommentId.get(c.id) || 0,
        replies: [],
      }));
    },
    staleTime: 0, // Always refetch when invalidated for immediate updates
    gcTime: 1000 * 60 * 15, // Cache for 15 minutes
    retry: 2,
  });

  // 4. Transform Flat Comments into a Nested Tree (with blocked user filtering)
  const nestedComments = useMemo(() => {
    if (!rawComments) return [];

    // Filter out comments from blocked users
    const filteredComments = rawComments.filter(
      (c) => c.user_id && !blocks.includes(c.user_id)
    );

    const commentMap: { [key: string]: CommentWithReplies } = {};
    const roots: CommentWithReplies[] = [];

    // First pass: Create a map of all comments and initialize their replies array
    filteredComments.forEach((c) => {
      commentMap[c.id] = { ...c, replies: [] };
    });

    // Second pass: Link children to parents
    filteredComments.forEach((c) => {
      if (c.parent_comment_id) {
        // If it has a parent, push it to the parent's replies array
        if (commentMap[c.parent_comment_id]) {
          commentMap[c.parent_comment_id].replies.push(commentMap[c.id]);
        }
      } else {
        // If no parent, it's a top-level comment
        roots.push(commentMap[c.id]);
      }
    });

    return roots;
  }, [rawComments, blocks]);

  // Fetch bookmarks for this post
  const { data: postBookmarks = [] } = useQuery<Bookmark[]>({
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

  // Mutation to post a comment with optimistic updates
  const createCommentMutation = useMutation({
    mutationFn: async ({
      content,
      parentId,
      isAnonymous,
    }: {
      content: string;
      parentId: string | null;
      isAnonymous: boolean;
    }) => {
      if (!currentUserId) {
        throw new Error("You must be logged in to post a comment");
      }

      if (!postId) {
        throw new Error("Post ID is required");
      }

      // Call Edge Function for AI moderation
      // Use fetch directly to access response body even on 400 status codes
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const functionUrl = `${supabaseUrl}/functions/v1/create-comment`;
      
      // Get auth token from session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        throw new Error("You must be logged in to post a comment.");
      }

      // Prepare comment payload for Edge Function
      const commentPayload = {
        content: content.trim(),
        post_id: postId,
        parent_comment_id: parentId || null,
        is_anonymous: isAnonymous,
      };

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(commentPayload),
      });

      // Parse response body (works for both 200 and 400 status)
      const responseData = await response.json();

      // Check if response contains an error (Edge Function returns { error: "..." } on failure)
      if (!response.ok) {
        // Extract error message from response body
        const errorMessage = responseData?.error || responseData?.message || "Failed to create comment";
        throw new Error(errorMessage);
      }

      // Additional check: if responseData has an error field even on 200 status
      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      // Validate that we received comment data
      if (!responseData || !responseData.id) {
        throw new Error("Invalid response from server");
      }

      // Return the comment data (edge function returns the inserted comment)
      return responseData;
    },
    onMutate: async ({ content, parentId, isAnonymous }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["comments", postId] });

      // Snapshot previous value
      const previousComments = queryClient.getQueryData<CommentWithReplies[]>([
        "comments",
        postId,
      ]);

      // Fetch current user profile for optimistic comment
      if (!currentUserId) return { previousComments };

      const { data: currentUser } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUserId)
        .single();

      // Create optimistic comment
      const optimisticComment: CommentWithReplies = {
        id: `temp-${Date.now()}`,
        post_id: postId!,
        user_id: currentUserId!,
        content: content.trim(),
        parent_comment_id: parentId,
        is_deleted: false,
        is_anonymous: isAnonymous,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: currentUser || undefined,
        replies: [],
        score: 0,
      };

      // Optimistically update cache
      queryClient.setQueryData<CommentWithReplies[]>(
        ["comments", postId],
        (old = []) => {
          return [...old, optimisticComment];
        }
      );

      return { previousComments };
    },
    onError: (error: Error, variables, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(
          ["comments", postId, currentUserId],
          context.previousComments
        );
      }

      // Only log to console in development (not visible to users in production)
      if (__DEV__) {
        console.error("Error posting comment:", error);
      }

      // Show the actual error message from Edge Function (already user-friendly)
      // Edge Function returns: "Comment violates community guidelines"
      let errorMessage = error.message || "Failed to post comment. Please try again.";

      // Handle specific error cases
      if (error.message?.includes("rate limit")) {
        errorMessage = "You're posting too fast. Please wait a moment.";
      } else if (
        error.message?.includes("network") ||
        error.message?.includes("timeout")
      ) {
        errorMessage = "Network error. Please check your connection.";
      }

      // This Alert is what users see - console errors are only for developers
      Alert.alert("Error", errorMessage);
    },
    onSuccess: async (newComment) => {
      // Replace temp comment with real one from server
      queryClient.setQueryData<CommentWithReplies[]>(
        ["comments", postId, currentUserId],
        (old = []) => {
          return old.map((comment) =>
            comment.id.startsWith("temp-")
              ? {
                  ...comment,
                  id: newComment.id,
                  created_at: newComment.created_at,
                }
              : comment
          );
        }
      );

      // OPTIMIZED: Only invalidate queries that need refetching
      // Use refetchType: 'none' to just mark as stale without immediate refetch

      // Invalidate current post to update comment count
      queryClient.invalidateQueries({
        queryKey: ["post", postId],
        refetchType: "active", // Only refetch if currently viewing
      });

      // Invalidate feed posts (they show comment count)
      queryClient.invalidateQueries({
        queryKey: ["posts", "feed"],
        refetchType: "none", // Don't refetch feed immediately
      });

      // Invalidate user's own posts/comments
      queryClient.invalidateQueries({
        queryKey: ["user-posts", currentUserId],
        refetchType: "none",
      });

      // Clear input and reset reply state
      setCommentText("");
      setParentCommentId(null);
      setReplyingToUsername(null);
      setIsAnonymousMode(false);
      inputRef.current?.blur();
    },
  });

  // Delete post mutation (hard delete with cascade) - MUST be before early returns
  const deletePostMutation = useMutation({
    mutationFn: async () => {
      if (!postId) throw new Error("Post ID is required");

      // Delete the post (comments and votes will cascade)
      const { error } = await supabase.from("posts").delete().eq("id", postId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all related queries to update everywhere
      queryClient.invalidateQueries({ queryKey: ["posts"] }); // Refresh feed
      queryClient.invalidateQueries({ queryKey: ["post", postId] }); // Current post
      queryClient.invalidateQueries({ queryKey: ["user-posts"] }); // Profile posts
      queryClient.invalidateQueries({ queryKey: ["user-post-comments"] }); // Profile comment counts
      queryClient.invalidateQueries({ queryKey: ["user-post-votes"] }); // Profile vote scores
      queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] }); // Bookmarked posts

      // Navigate back
      router.back();

      Alert.alert("Success", "Post deleted successfully");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to delete post");
    },
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
          onPress: () => deletePostMutation.mutate(),
        },
      ]
    );
  };

  // Bookmark mutation
  const bookmarkMutation = useMutation({
    mutationFn: async (shouldBookmark: boolean) => {
      if (!currentUserId || !postId) throw new Error("User or post ID missing");

      if (shouldBookmark) {
        // Add bookmark
        const { error } = await supabase.from("bookmarks").insert({
          user_id: currentUserId,
          post_id: postId,
        });
        if (error) throw error;
      } else {
        // Remove bookmark
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", currentUserId)
          .eq("post_id", postId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Invalidate all bookmark-related queries
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] }); // Refresh bookmarked list
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update bookmark");
    },
  });

  const toggleBookmark = () => {
    bookmarkMutation.mutate(!isBookmarked);
  };

  // Report post mutation
  const reportPostMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!currentUserId || !postId) throw new Error("User or post ID missing");

      const { error } = await supabase.from("reports").insert({
        reporter_id: currentUserId,
        post_id: postId,
        comment_id: null,
        reason: reason,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setShowReportModal(false);
      setShowMenu(false);
      // Show block user modal after successful report
      setShowBlockModal(true);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to submit report");
    },
  });

  // Block user mutation
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
      // Invalidate blocks query to refresh blocked users list
      queryClient.invalidateQueries({ queryKey: ["blocks", currentUserId] });
      // Invalidate queries to filter out blocked user's content
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries", currentUserId],
      });

      // Refetch current post to hide if author is blocked
      queryClient.invalidateQueries({ queryKey: ["post", postId] });

      Alert.alert("Success", "User blocked successfully");
      router.back(); // Go back to feed
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to block user");
    },
  });

  const handleReportPost = (reason: string) => {
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
      comments: CommentWithReplies[]
    ): CommentWithReplies | null => {
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
      setReplyingToUsername(targetComment.user?.username || "Unknown");
      inputRef.current?.focus();
    }
  };

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    if (!currentUserId) {
      Alert.alert("Error", "You must be logged in to post a comment");
      return;
    }

    createCommentMutation.mutate({
      content: commentText,
      parentId: parentCommentId,
      isAnonymous: isAnonymousMode,
    });
  };

  const handleCancelReply = () => {
    setParentCommentId(null);
    setReplyingToUsername(null);
    setCommentText("");
    setIsAnonymousMode(false);
  };

  // Memoize renderItem and keyExtractor for performance
  // MUST be before any conditional returns to follow Rules of Hooks
  const renderCommentItem = useCallback(
    ({ item }: { item: CommentWithReplies }) => (
      <CommentListItem
        comment={item}
        depth={0}
        handleReplyPress={handleReplyPress}
      />
    ),
    [handleReplyPress]
  );

  const keyExtractor = useCallback((item: CommentWithReplies) => item.id, []);

  const postScore = 0;

  const isLoading = isPostLoading || isUserLoading || isCommentsLoading;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (postError || userError || commentsError) {
    console.log("post error:", postError);
    console.log("user error: ", userError);
    console.log("comments error: ", commentsError);
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          Failed to load content.
        </Text>
      </View>
    );
  }

  if (!detailedPost) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          Post Not Found!
        </Text>
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
          Post Not Found!
        </Text>
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
              name="close"
              size={24}
              color="white"
              onPress={() => router.back()}
            />
          ),
          headerRight: () => (
            <Pressable onPress={() => setShowMenu(true)}>
              <Entypo name="dots-three-horizontal" size={24} color="white" />
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
            ? "Anonymous"
            : detailedPost?.username || "User"
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: theme.background }}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            ListHeaderComponent={
              <PostListItem
                postId={detailedPost.post_id || detailedPost.id}
                userId={detailedPost.user_id}
                content={detailedPost.content}
                imageUrl={detailedPost.image_url}
                category={detailedPost.category}
                location={detailedPost.location}
                postType={detailedPost.post_type}
                isAnonymous={detailedPost.is_anonymous}
                isEdited={detailedPost.is_edited}
                createdAt={detailedPost.created_at}
                updatedAt={detailedPost.updated_at}
                editedAt={detailedPost.edited_at}
                viewCount={detailedPost.view_count}
                username={
                  detailedPost.username || postUser?.username || "Unknown"
                }
                avatarUrl={
                  detailedPost.avatar_url || postUser?.avatar_url || null
                }
                isVerified={
                  detailedPost.is_verified || postUser?.is_verified || null
                }
                commentCount={rawComments?.length || 0}
                voteScore={postScore}
                userVote={null}
                repostCount={detailedPost.repost_count || 0}
                repostedFromPostId={detailedPost.reposted_from_post_id}
                repostComment={detailedPost.repost_comment}
                originalContent={detailedPost.original_content}
                originalAuthorUsername={detailedPost.original_author_username}
                originalAuthorAvatar={detailedPost.original_author_avatar}
                originalIsAnonymous={detailedPost.original_is_anonymous}
                originalCreatedAt={detailedPost.original_created_at}
                isDetailedPost
                isBookmarked={isBookmarked}
                onBookmarkPress={toggleBookmark}
              />
            }
            // Pass the nested tree (roots) to the FlatList
            data={nestedComments}
            renderItem={renderCommentItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefetchingComments}
                onRefresh={refetchComments}
                tintColor={theme.primary}
              />
            }
            // Performance optimizations
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            initialNumToRender={10}
            windowSize={5}
          />

          {/* POST A COMMENT */}
          <View
            style={[
              styles.inputContainer,
              {
                paddingBottom: insets.bottom + 10,
                backgroundColor: theme.card,
                borderTopColor: theme.border,
                shadowColor: theme.text,
              },
            ]}
          >
            {/* Anonymous Toggle */}
            <View style={styles.anonymousToggle}>
              <View style={styles.anonymousToggleLeft}>
                {isAnonymousMode ? (
                  <Image source={nuLogo} style={styles.toggleAvatar} />
                ) : (
                  <Ionicons name="person" size={20} color={theme.text} />
                )}
                <Text style={[styles.anonymousText, { color: theme.text }]}>
                  {isAnonymousMode
                    ? "Anonymous"
                    : `As ${session?.user?.user_metadata?.username || "You"}`}
                </Text>
              </View>
              <Switch
                value={isAnonymousMode}
                onValueChange={setIsAnonymousMode}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={"white"}
              />
            </View>
            {/* Reply indicator */}
            {replyingToUsername && (
              <View style={styles.replyIndicator}>
                <Text
                  style={[
                    styles.replyIndicatorText,
                    { color: theme.secondaryText },
                  ]}
                >
                  Replying to{" "}
                  <Text style={{ fontWeight: "600" }}>
                    {replyingToUsername}
                  </Text>
                </Text>
                <Pressable
                  onPress={handleCancelReply}
                  style={styles.cancelReplyButton}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={16}
                    color={theme.secondaryText}
                  />
                </Pressable>
              </View>
            )}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                placeholder={
                  parentCommentId
                    ? `Reply to ${replyingToUsername}...`
                    : "Comment..."
                }
                placeholderTextColor={theme.secondaryText}
                value={commentText}
                onChangeText={setCommentText}
                style={[
                  styles.input,
                  { backgroundColor: theme.background, color: theme.text },
                ]}
                multiline
                editable={!createCommentMutation.isPending}
              />
              <Pressable
                disabled={
                  !commentText.trim() || createCommentMutation.isPending
                }
                onPress={handlePostComment}
                style={[
                  styles.replyButton,
                  {
                    backgroundColor:
                      !commentText.trim() || createCommentMutation.isPending
                        ? theme.border
                        : theme.primary,
                  },
                ]}
              >
                {createCommentMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="send" size={20} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
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

function PostErrorFallback({ error, resetErrorBoundary }: any) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.errorText, { color: theme.text }]}>
        Something went wrong
      </Text>
      <Text
        style={[
          styles.errorText,
          {
            color: theme.secondaryText,
            fontSize: 14,
            marginTop: 10,
          },
        ]}
      >
        {error.message}
      </Text>
      <Pressable
        onPress={resetErrorBoundary}
        style={{
          marginTop: 20,
          paddingHorizontal: 20,
          paddingVertical: 10,
          backgroundColor: theme.primary,
          borderRadius: 8,
        }}
      >
        <Text
          style={{
            color: "white",
            fontFamily: "Poppins_500Medium",
          }}
        >
          Try Again
        </Text>
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
