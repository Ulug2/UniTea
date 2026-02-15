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
import { DEFAULT_AVATAR } from "../constants/images";
import SupabaseImage from "./SupabaseImage";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDeleteComment } from "../features/comments/hooks/useDeleteComment";
import ReportModal from "./ReportModal";
import BlockUserModal from "./BlockUserModal";
import UserProfileModal from "./UserProfileModal";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];

type CommentWithReplies = Comment & {
  replies?: CommentWithReplies[];
  user?: Profile;
  score?: number;
  post_specific_anon_id?: number | null;
};

type ParentInfo = {
  id: string | null;
  is_anonymous: boolean;
  post_specific_anon_id?: number | null;
  username: string | null;
};

type CommentListItemProps = {
  comment: CommentWithReplies;
  depth: number;
  handleReplyPress: (commentId: string) => void;
  parentUser?: ParentInfo;
  onDeleteStart?: (commentId: string) => void;
  onDeleteEnd?: () => void;
  isAdmin?: boolean;
};

const CommentListItem = ({
  comment,
  depth,
  handleReplyPress,
  parentUser,
  onDeleteStart,
  onDeleteEnd,
  isAdmin = false,
}: CommentListItemProps) => {
  const { theme } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id;
  const isCommentOwner = currentUserId === comment.user_id;
  const canDelete = isCommentOwner || isAdmin;

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
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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

  const deleteCommentMutation = useDeleteComment(comment.id, {
    postId: comment.post_id,
    currentUserId,
    onSuccess: () => onDeleteEnd?.(),
    onError: () => onDeleteEnd?.(),
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
          onPress: () => { },
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            onDeleteStart?.(comment.id);
            deleteCommentMutation.mutate();
          },
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

  const truncateName = (name: string | null | undefined, max: number) => {
    if (!name) return null;
    if (name.length <= max) return name;
    return name.slice(0, max) + "...";
  };

  const getAnonLabel = (c: CommentWithReplies) => {
    if (!c.is_anonymous) {
      return c.user?.username || "Unknown";
    }
    const anonId = c.post_specific_anon_id;
    if (anonId && typeof anonId === "number") {
      return `User ${anonId}`;
    }
    // Fallback if IDs are not yet backfilled
    return "Anonymous";
  };

  const displayName = comment.is_anonymous
    ? getAnonLabel(comment)
    : truncateName(comment.user?.username || "Unknown", 15) || "Unknown";

  const parentDisplayName =
    parentUser && parentUser.is_anonymous
      ? parentUser.post_specific_anon_id
        ? `User ${parentUser.post_specific_anon_id}`
        : "Anonymous"
      : truncateName(parentUser?.username || null, 15);

  // Only first reply level gets extra indent; deeper replies use no extra padding
  // so they align with their parent (avoids negative margin and layout gaps).
  const containerIndentStyle =
    depth >= 2 ? { paddingLeft: 0 } : undefined;

  // When this comment has visible nested replies, drop bottom padding so the next
  // sibling (e.g. another reply to the same parent) doesn't get an extra gap.
  const containerGapFixStyle =
    hasReplies && showReplies ? { paddingBottom: 0 } : undefined;

  return (
    <View
      style={[
        styles.container,
        containerIndentStyle,
        containerGapFixStyle,
        {
          backgroundColor: theme.card,
        },
      ]}
    >
      {/* User Info */}
      <View style={styles.userRow}>
        <View style={styles.userInfoRow}>
          <Pressable
            style={styles.userInfo}
            onPress={() => {
              // Only show modal for other users (not current user) and non-anonymous users
              if (!comment.is_anonymous && comment.user_id && comment.user_id !== currentUserId) {
                setSelectedUserId(comment.user_id);
                setProfileModalVisible(true);
              }
            }}
            disabled={comment.is_anonymous || !comment.user_id || comment.user_id === currentUserId}
          >
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
              <Image source={DEFAULT_AVATAR} style={styles.avatar} />
            )}
            <Text style={[styles.username, { color: theme.text }]}>
              {displayName}
            </Text>
          </Pressable>
          {parentUser && parentDisplayName && (
            <Pressable
              onPress={() => {
                if (
                  !parentUser.is_anonymous &&
                  parentUser.id &&
                  parentUser.id !== currentUserId
                ) {
                  setSelectedUserId(parentUser.id);
                  setProfileModalVisible(true);
                }
              }}
              disabled={
                parentUser.is_anonymous ||
                !parentUser.id ||
                parentUser.id === currentUserId
              }
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <MaterialCommunityIcons
                name="play"
                size={12}
                color={theme.secondaryText}
                style={{ marginLeft: 4 }}
              />
              <Text
                style={[styles.replyToUsername, { color: theme.secondaryText }]}
              >
                {parentDisplayName}
              </Text>
            </Pressable>
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
            {canDelete ? (
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
            ) : null}
            {!isCommentOwner ? (
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
              size={20}
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
              size={20}
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
                parentUser={{
                  id: comment.user_id ?? null,
                  is_anonymous: !!comment.is_anonymous,
                  post_specific_anon_id: comment.post_specific_anon_id,
                  username: comment.user?.username ?? null,
                }}
                onDeleteStart={onDeleteStart}
                onDeleteEnd={onDeleteEnd}
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

      {/* User Profile Modal */}
      {selectedUserId && (
        <UserProfileModal
          visible={profileModalVisible}
          onClose={() => {
            setProfileModalVisible(false);
            setSelectedUserId(null);
          }}
          userId={selectedUserId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
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
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
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
    marginRight: 15,
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

export default memo(CommentListItem);
