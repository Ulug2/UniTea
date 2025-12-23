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
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import PostListItem from "../../../components/PostListItem";
import CommentListItem from "../../../components/CommentListItem";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { Tables } from "../../../types/database.types";
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

  const [commentText, setCommentText] = useState<string>("");
  const inputRef = useRef<TextInput | null>(null);

  // 1. Fetch Post Details
  const {
    data: detailedPost,
    isLoading: isPostLoading,
    error: postError,
  } = useQuery<Post | null>({
    queryKey: ["post", postId],
    enabled: Boolean(postId),
    queryFn: async () => {
      if (!postId) return null;
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
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
    staleTime: 1000 * 30, // Comments stay fresh for 30 seconds
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
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id || null;
    },
    staleTime: Infinity, // Session doesn't change
    gcTime: Infinity, // Keep in cache forever
  });

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
    if (!currentUser) return false;
    return postBookmarks.some((b) => b.user_id === currentUser);
  }, [postBookmarks, currentUser]);

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
    console.log("Reply to comment:", commentId);
    // You might want to store this ID in state to know which comment is being replied to
    inputRef.current?.focus();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.background }}
      keyboardVerticalOffset={insets.top + 10}
    >
      <FlatList
        ListHeaderComponent={
          <PostListItem
            post={{ ...detailedPost, upvotes: postScore } as any}
            isDetailedPost
            user={postUser || undefined}
            commentCount={rawComments?.length || 0}
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
        contentContainerStyle={{ paddingBottom: 100 }} // Extra padding for input
      />

      {/* POST A COMMENT */}
      <View
        style={[
          styles.inputContainer,
          {
            paddingBottom: insets.bottom + 10, // Added a little extra padding
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            shadowColor: theme.text,
          },
        ]}
      >
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            placeholder="Comment..."
            placeholderTextColor={theme.secondaryText}
            value={commentText}
            onChangeText={setCommentText}
            style={[
              styles.input,
              { backgroundColor: theme.background, color: theme.text },
            ]}
            multiline
          />
          <Pressable
            disabled={!commentText.trim()}
            onPress={() => console.log("Send pressed for:", commentText)}
            style={[
              styles.replyButton,
              {
                backgroundColor: !commentText.trim()
                  ? theme.border
                  : theme.primary,
              },
            ]}
          >
            <MaterialCommunityIcons name="send" size={20} color="#fff" />
          </Pressable>
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
    position: "absolute",
    bottom: 0,
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
});
