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
import { useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useDeleteComment } from "../features/comments/hooks/useDeleteComment";
import { useBlockUser } from "../features/posts/hooks/useBlockUser";
import { useBlocks, hasBlockForScope } from "../hooks/useBlocks";
import ReportModal from "./ReportModal";
import UserProfileModal from "./UserProfileModal";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

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

// Enable LayoutAnimation once per module load on Android.
// Must NOT run inside the component body because that fires on every re-render
// and interferes with navigation transition animations.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  const _isBridgeless =
    typeof globalThis !== "undefined" &&
    (globalThis as { RN$Bridgeless?: boolean }).RN$Bridgeless === true;
  if (!_isBridgeless) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

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
  const currentUserId = session?.user?.id;
  const isCommentOwner = currentUserId === comment.user_id;
  const canDelete = isCommentOwner || isAdmin;

  const { data: blocks = [] } = useBlocks();
  const commentScope = (comment.is_anonymous ?? false) ? "anonymous_only" : "profile_only";
  const alreadyBlockedInScope = hasBlockForScope(blocks, comment.user_id, commentScope);

  const hasReplies = comment.replies && comment.replies.length > 0;
  const replyCount = comment.replies?.length || 0;

  // Auto-show replies if there are 3 or fewer
  const [showReplies, setShowReplies] = useState(
    replyCount <= 3 && replyCount > 0
  );
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to submit report");
    },
  });

  const blockUserMutation = useBlockUser(currentUserId ?? null);

  const handleReportComment = (reason: string) => {
    reportCommentMutation.mutate(reason);
  };

  const handleBlockUser = () => {
    if (!comment.user_id) return;

    const isAnon = comment.is_anonymous ?? false;
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
          blockUserMutation.mutate({ targetUserId: comment.user_id!, scope }),
      },
    ]);
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
                size={moderateScale(12)}
                color={theme.secondaryText}
                style={{ marginLeft: scale(4) }}
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
            size={moderateScale(15)}
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
                  size={moderateScale(20)}
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
                  size={moderateScale(20)}
                  color={theme.text}
                />
                <Text style={[styles.menuText, { color: theme.text }]}>
                  Report Content
                </Text>
              </Pressable>
            ) : null}
            {!isCommentOwner && !alreadyBlockedInScope ? (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  handleBlockUser();
                }}
              >
                <MaterialCommunityIcons
                  name="block-helper"
                  size={moderateScale(20)}
                  color={theme.text}
                />
                <Text style={[styles.menuText, { color: theme.text }]}>
                  {comment.is_anonymous ? "Block Anonymous User" : "Block User"}
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
          <Octicons name="reply" size={moderateScale(16)} color={theme.secondaryText} />
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
              size={moderateScale(20)}
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
              size={moderateScale(20)}
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
    paddingLeft: scale(15),
    paddingVertical: verticalScale(6),
    gap: moderateScale(5),
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(4),
    flex: 1,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(3),
  },
  avatar: {
    width: scale(28),
    height: verticalScale(28),
    borderRadius: moderateScale(15),
    marginRight: scale(4),
  },
  username: {
    fontWeight: "600",
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
  replyToUsername: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    marginLeft: scale(2),
  },
  dot: {
    fontSize: moderateScale(13),
  },
  threeDots: {
    marginRight: scale(15),
  },
  time: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_400Regular",
  },
  content: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    lineHeight: moderateScale(22),
    marginRight: scale(15),
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginRight: scale(15), // Consistent right margin for all comments
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(5),
  },
  actionText: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
  },
  votes: {
    flexDirection: "row",
    gap: moderateScale(5),
    alignItems: "center",
  },
  voteCount: {
    fontWeight: "500",
    fontFamily: "Poppins_500Medium",
  },
  showRepliesButton: {
    borderRadius: moderateScale(6),
    paddingVertical: verticalScale(6),
    alignItems: "center",
    marginTop: verticalScale(5),
  },
  hideRepliesButton: {
    borderRadius: moderateScale(6),
    paddingVertical: verticalScale(6),
    alignItems: "center",
    marginTop: verticalScale(5),
    marginBottom: verticalScale(5),
  },
  loadMoreButton: {
    borderRadius: moderateScale(6),
    paddingVertical: verticalScale(6),
    alignItems: "center",
    marginTop: verticalScale(5),
  },
  showRepliesText: {
    fontSize: moderateScale(12),
    letterSpacing: moderateScale(0.5),
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
  menuText: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_500Medium",
  },
});

// Custom equality check: skips re-render when a refetch delivers new object
// references but the content hasn't actually changed.
function arePropsEqual(
  prev: CommentListItemProps,
  next: CommentListItemProps,
): boolean {
  // Short-circuit: if the comment object reference is identical, nothing changed.
  if (
    prev.comment === next.comment &&
    prev.handleReplyPress === next.handleReplyPress &&
    prev.onDeleteStart === next.onDeleteStart &&
    prev.onDeleteEnd === next.onDeleteEnd &&
    prev.depth === next.depth &&
    prev.isAdmin === next.isAdmin
  ) {
    return true;
  }
  return (
    prev.comment.id === next.comment.id &&
    prev.comment.content === next.comment.content &&
    prev.comment.score === next.comment.score &&
    prev.comment.is_deleted === next.comment.is_deleted &&
    prev.comment.is_anonymous === next.comment.is_anonymous &&
    (prev.comment.replies?.length ?? 0) === (next.comment.replies?.length ?? 0) &&
    prev.handleReplyPress === next.handleReplyPress &&
    prev.onDeleteStart === next.onDeleteStart &&
    prev.onDeleteEnd === next.onDeleteEnd &&
    prev.depth === next.depth &&
    prev.isAdmin === next.isAdmin
  );
}

export default memo(CommentListItem, arePropsEqual);
