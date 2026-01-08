import { useState, useRef, useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
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
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PostListItem from "../../../components/PostListItem";
import CommentListItem from "../../../components/CommentListItem";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { useAuth } from "../../../context/AuthContext";
import { Tables, TablesInsert } from "../../../types/database.types";
import { supabase } from "../../../lib/supabase";

type Post = Tables<"posts">;
type Comment = Tables<"comments">;
type Profile = Tables<"profiles">;
type Vote = Tables<"votes">;
type Bookmark = Tables<"bookmarks">;

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
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(null);
  const inputRef = useRef<TextInput | null>(null);

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
        .single();
      if (error) throw error;
      return data;
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
    queryKey: ["comments", postId],
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

  // 4. Transform Flat Comments into a Nested Tree
  const nestedComments = useMemo(() => {
    if (!rawComments) return [];

    const commentMap: { [key: string]: CommentWithReplies } = {};
    const roots: CommentWithReplies[] = [];

    // First pass: Create a map of all comments and initialize their replies array
    rawComments.forEach((c) => {
      commentMap[c.id] = { ...c, replies: [] };
    });

    // Second pass: Link children to parents
    rawComments.forEach((c) => {
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
  }, [rawComments]);

  // Get current user
  const currentUserId = session?.user?.id || null;

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
    }: {
      content: string;
      parentId: string | null;
    }) => {
      if (!currentUserId) {
        throw new Error("You must be logged in to post a comment");
      }

      if (!postId) {
        throw new Error("Post ID is required");
      }

      const commentData: TablesInsert<"comments"> = {
        post_id: postId,
        user_id: currentUserId,
        content: content.trim(),
        parent_comment_id: parentId,
        is_deleted: false,
      };

      const { data, error } = await supabase
        .from("comments")
        .insert(commentData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ content, parentId }) => {
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: currentUser || undefined,
        replies: [],
        score: 0,
      };

      // Optimistically update cache
      queryClient.setQueryData<CommentWithReplies[]>(["comments", postId], (old = []) => {
        return [...old, optimisticComment];
      });

      return { previousComments };
    },
    onError: (error: Error, variables, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(["comments", postId], context.previousComments);
      }
      console.error("Error posting comment:", error);
      Alert.alert("Error", error.message || "Failed to post comment. Please try again.");
    },
    onSuccess: async (newComment) => {
      // Replace temp comment with real one from server
      queryClient.setQueryData<CommentWithReplies[]>(["comments", postId], (old = []) => {
        return old.map((comment) =>
          comment.id.startsWith("temp-")
            ? { ...comment, id: newComment.id, created_at: newComment.created_at }
            : comment
        );
      });

      // Mark posts queries as stale without refetching (preserves scroll position)
      queryClient.invalidateQueries({
        queryKey: ["posts", "feed"],
        refetchType: 'none' // Don't refetch, just mark as stale
      });
      queryClient.invalidateQueries({
        queryKey: ["post", postId],
        refetchType: 'none'
      });

      // Clear input and reset reply state
      setCommentText("");
      setParentCommentId(null);
      setReplyingToUsername(null);
      inputRef.current?.blur();
    },
  });

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

  const toggleBookmark = () => {
    console.log(isBookmarked ? "Remove bookmark" : "Add bookmark");
    // TODO: Implement bookmark mutation
  };

  const handleReplyPress = (commentId: string) => {
    // Find the comment to get the username
    const findComment = (comments: CommentWithReplies[]): CommentWithReplies | null => {
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
    });
  };

  const handleCancelReply = () => {
    setParentCommentId(null);
    setReplyingToUsername(null);
    setCommentText("");
  };

  return (
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
              username={detailedPost.username || postUser?.username || "Unknown"}
              avatarUrl={detailedPost.avatar_url || postUser?.avatar_url || null}
              isVerified={detailedPost.is_verified || postUser?.is_verified || null}
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
          renderItem={({ item }) => (
            // Important: Your CommentListItem needs to be able to render 'item.replies' recursively
            <CommentListItem
              comment={item}
              depth={0}
              handleReplyPress={handleReplyPress}
            />
          )}
          keyExtractor={(item) => item.id}
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
          {/* Reply indicator */}
          {replyingToUsername && (
            <View style={styles.replyIndicator}>
              <Text style={[styles.replyIndicatorText, { color: theme.secondaryText }]}>
                Replying to <Text style={{ fontWeight: "600" }}>{replyingToUsername}</Text>
              </Text>
              <Pressable onPress={handleCancelReply} style={styles.cancelReplyButton}>
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
              placeholder={parentCommentId ? `Reply to ${replyingToUsername}...` : "Comment..."}
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
              disabled={!commentText.trim() || createCommentMutation.isPending}
              onPress={handlePostComment}
              style={[
                styles.replyButton,
                {
                  backgroundColor: !commentText.trim() || createCommentMutation.isPending
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
});
