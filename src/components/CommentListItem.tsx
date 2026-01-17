import { useState, useEffect, memo } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { Entypo, Octicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDistanceToNowStrict } from "date-fns";
import { useTheme } from "../context/ThemeContext";
import { Database } from "../types/database.types";
import { useVote } from "../hooks/useVote";
import nuLogo from "../../assets/images/nu-logo.png";
import SupabaseImage from "./SupabaseImage";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ReportModal from "./ReportModal";
import BlockUserModal from "./BlockUserModal";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];

type CommentWithReplies = Comment & {
  replies?: CommentWithReplies[];
  user?: Profile;
  score?: number;
};

type CommentListItemProps = {
  comment: CommentWithReplies;
  depth: number;
  handleReplyPress: (commentId: string) => void;
  parentUser?: Profile;
};

const CommentListItem = ({
  comment,
  depth,
  handleReplyPress,
  parentUser,
}: CommentListItemProps) => {
  const { theme } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id;
  const isCommentOwner = currentUserId === comment.user_id;

  const hasReplies = comment.replies && comment.replies.length > 0;
  const replyCount = comment.replies?.length || 0;

  // Auto-show replies if there are 3 or fewer
  const [showReplies, setShowReplies] = useState(
    replyCount <= 3 && replyCount > 0
  );
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);

  // Enable layout animation for Android
  if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
  ) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  // Fix state synchronization: Auto-show replies when new replies are added
  useEffect(() => {
    // If reply count increases and is <= 3, automatically show replies
    if (replyCount > 0 && replyCount <= 3 && !showReplies) {
      // Trigger smooth layout animation before updating state
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowReplies(true);
    }
  }, [replyCount, showReplies]);

  // Use vote hook for comment voting
  const {
    userVote,
    score: commentScore,
    handleUpvote,
    handleDownvote,
    isVoting,
  } = useVote({
    commentId: comment.id,
  });

  // Delete comment mutation (hard delete with cascade)
  const deleteCommentMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", comment.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all related queries to refresh everywhere
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] }); // Refresh feed
      queryClient.invalidateQueries({ queryKey: ["user-posts"] }); // Refresh profile posts
      queryClient.invalidateQueries({ queryKey: ["user-post-comments"] }); // Refresh profile comment counts
      queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] }); // Refresh bookmarked
      Alert.alert("Success", "Comment deleted successfully");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to delete comment");
    },
  });

  const handleDeleteComment = () => {
    setShowMenu(false);

    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCommentMutation.mutate(),
        },
      ]
    );
  };

  // Report comment mutation
  const reportCommentMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!currentUserId) throw new Error("User ID missing");

      // For comment reports, only set comment_id (not post_id)
      // The constraint requires exactly one of post_id or comment_id to be set
      const { error } = await supabase.from("reports").insert({
        reporter_id: currentUserId,
        post_id: null, // Don't set post_id for comment reports
        comment_id: comment.id,
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
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      // Invalidate queries to filter out blocked user's content
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      queryClient.invalidateQueries({ queryKey: ["chat-summaries"] });

      Alert.alert("Success", "User blocked successfully");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to block user");
    },
  });

  const handleReportComment = (reason: string) => {
    reportCommentMutation.mutate(reason);
  };

  const handleBlockUser = () => {
    if (!comment.user_id) return;

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
          onPress: () => {
            if (comment.user_id) {
              blockUserMutation.mutate(comment.user_id);
            }
          },
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
        },
      ]}
    >
      {/* User Info */}
      <View style={styles.userRow}>
        <View style={styles.userInfo}>
          {comment.is_anonymous ? (
            <Image source={nuLogo} style={styles.avatar} />
          ) : comment.user?.avatar_url ? (
            comment.user.avatar_url.startsWith("http") ? (
              <Image
                source={{ uri: comment.user.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <SupabaseImage
                path={comment.user.avatar_url}
                bucket="avatars"
                style={styles.avatar}
              />
            )
          ) : (
            <Image source={nuLogo} style={styles.avatar} />
          )}
          <Text style={[styles.username, { color: theme.text }]}>
            {comment.is_anonymous
              ? "Anonymous"
              : comment.user?.username || "Unknown"}
          </Text>
          {parentUser && (
            <>
              <MaterialCommunityIcons
                name="play"
                size={12}
                color={theme.secondaryText}
                style={{ marginLeft: 4 }}
              />
              <Text
                style={[styles.replyToUsername, { color: theme.secondaryText }]}
              >
                {parentUser.username}
              </Text>
            </>
          )}
          <Text style={[styles.dot, { color: theme.secondaryText }]}>•</Text>
          <Text style={[styles.time, { color: theme.secondaryText }]}>
            {comment.created_at
              ? formatDistanceToNowStrict(new Date(comment.created_at))
              : "Recently"}
          </Text>
        </View>
        <Pressable style={styles.threeDots} onPress={() => setShowMenu(true)}>
          <Entypo
            name="dots-three-horizontal"
            size={15}
            color={theme.secondaryText}
          />
        </Pressable>
      </View>

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
            {isCommentOwner ? (
              <Pressable style={styles.menuItem} onPress={handleDeleteComment}>
                <MaterialCommunityIcons
                  name="delete"
                  size={20}
                  color="#EF4444"
                />
                <Text style={[styles.menuText, { color: "#EF4444" }]}>
                  Delete Comment
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
        onSubmit={handleReportComment}
        isLoading={reportCommentMutation.isPending}
        reportType="comment"
      />

      {/* Block User Modal */}
      <BlockUserModal
        visible={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        onBlock={handleBlockUser}
        isLoading={blockUserMutation.isPending}
        username={comment.user?.username || "Unknown"}
      />

      {/* Comment Content */}
      <Text style={[styles.content, { color: theme.text }]}>
        {comment.content}
      </Text>

      {/* Comment Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => handleReplyPress(comment.id)}
          style={styles.actionButton}
        >
          <Octicons name="reply" size={16} color={theme.secondaryText} />
          <Text style={[styles.actionText, { color: theme.secondaryText }]}>
            Reply
          </Text>
        </Pressable>
        <View style={styles.votes}>
          <Pressable onPress={handleUpvote} disabled={isVoting}>
            <MaterialCommunityIcons
              name={
                userVote === "upvote"
                  ? "arrow-up-bold"
                  : "arrow-up-bold-outline"
              }
              size={18}
              color={
                userVote === "upvote" ? theme.primary : theme.secondaryText
              }
            />
          </Pressable>
          <Text style={[styles.voteCount, { color: theme.secondaryText }]}>
            {commentScore}
          </Text>
          <Pressable onPress={handleDownvote} disabled={isVoting}>
            <MaterialCommunityIcons
              name={
                userVote === "downvote"
                  ? "arrow-down-bold"
                  : "arrow-down-bold-outline"
              }
              size={18}
              color={
                userVote === "downvote" ? theme.primary : theme.secondaryText
              }
            />
          </Pressable>
        </View>
      </View>

      {/* Show Replies Button - only show if more than 3 replies */}
      {hasReplies && !showReplies && replyCount > 3 && (
        <Pressable
          onPress={() => setShowReplies(true)}
          style={[
            styles.showRepliesButton,
            { backgroundColor: theme.background },
          ]}
        >
          <Text
            style={[styles.showRepliesText, { color: theme.secondaryText }]}
          >
            Show {comment.replies!.length}{" "}
            {comment.replies!.length === 1 ? "Reply" : "Replies"}
          </Text>
        </Pressable>
      )}

      {/* Nested Replies - Paginated */}
      {showReplies && hasReplies && (
        <>
          {replyCount > 3 && (
            <Pressable
              onPress={() => setShowReplies(false)}
              style={[
                styles.hideRepliesButton,
                { backgroundColor: theme.background },
              ]}
            >
              <Text
                style={[styles.showRepliesText, { color: theme.secondaryText }]}
              >
                Hide Replies
              </Text>
            </Pressable>
          )}
          {/* Limit initial replies shown and add pagination */}
          {comment
            .replies!.slice(0, showAllReplies ? undefined : 5)
            .map((item) => (
              <CommentListItem
                key={item.id}
                comment={item}
                depth={depth + 1}
                handleReplyPress={handleReplyPress}
                parentUser={comment.user}
              />
            ))}
          {/* Show "Load More" if more than 5 replies */}
          {!showAllReplies && comment.replies!.length > 5 && (
            <Pressable
              onPress={() => setShowAllReplies(true)}
              style={[
                styles.loadMoreButton,
                { backgroundColor: theme.background },
              ]}
            >
              <Text
                style={[styles.showRepliesText, { color: theme.secondaryText }]}
              >
                Load {comment.replies!.length - 5} more replies
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 0,
    paddingLeft: 15,
    paddingVertical: 6,
    gap: 5,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 15,
    marginRight: 4,
  },
  username: {
    fontWeight: "600",
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  replyToUsername: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginLeft: 2,
  },
  dot: {
    fontSize: 13,
  },
  threeDots: {
    marginRight: 15,
  },
  time: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  content: {
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginRight: 15, // Consistent right margin for all comments
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  votes: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  voteCount: {
    fontWeight: "500",
    fontFamily: "Poppins_500Medium",
  },
  showRepliesButton: {
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    marginTop: 5,
  },
  hideRepliesButton: {
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    marginTop: 5,
    marginBottom: 5,
  },
  loadMoreButton: {
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    marginTop: 5,
  },
  showRepliesText: {
    fontSize: 12,
    letterSpacing: 0.5,
    fontWeight: "500",
    fontFamily: "Poppins_500Medium",
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
});

// Custom comparison function for better memoization
const areCommentPropsEqual = (
  prevProps: CommentListItemProps,
  nextProps: CommentListItemProps
) => {
  // Compare comment ID and key properties
  if (prevProps.comment.id !== nextProps.comment.id) return false;
  if (prevProps.depth !== nextProps.depth) return false;
  if (prevProps.comment.content !== nextProps.comment.content) return false;
  if (prevProps.comment.is_anonymous !== nextProps.comment.is_anonymous) return false;
  if (prevProps.comment.is_deleted !== nextProps.comment.is_deleted) return false;
  if (prevProps.comment.user?.id !== nextProps.comment.user?.id) return false;
  if (prevProps.comment.user?.avatar_url !== nextProps.comment.user?.avatar_url) return false;
  if (prevProps.comment.user?.username !== nextProps.comment.user?.username) return false;
  if (prevProps.comment.score !== nextProps.comment.score) return false;
  if (prevProps.comment.replies?.length !== nextProps.comment.replies?.length) return false;
  if (prevProps.parentUser?.id !== nextProps.parentUser?.id) return false;
  
  return true;
};

export default memo(CommentListItem, areCommentPropsEqual);
