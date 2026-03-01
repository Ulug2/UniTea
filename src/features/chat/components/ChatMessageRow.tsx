import React, { memo } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { ChatMessageVM } from "../types";
import {
  isDeletedForViewer,
  isDeletedForEveryone,
  deletedLabel,
} from "../types";
import { chatDetailStyles } from "../styles";
import SupabaseImage from "../../../components/SupabaseImage";
import type { Theme } from "../../../context/ThemeContext";

type ChatMessageRowProps = {
  item: ChatMessageVM;
  nextMsg: ChatMessageVM | null;
  currentUserId: string | undefined;
  theme: Theme;
  onLongPress: (message: ChatMessageVM) => void;
  onRetry: (messageId: string) => void;
  onImagePress: (url: string) => void;
  getMessageTime: (dateString: string | null) => string;
  getDateDivider: (dateString: string | null) => string;
  shouldShowDateDivider: (
    currentMsg: ChatMessageVM,
    nextMsg: ChatMessageVM | null,
  ) => boolean;
  /** Called when the user taps the embedded reply quote. */
  onReplyQuotePress?: (replyToId: string) => void;
  /** Returns the display name for a given user ID ("You" or partner name). */
  getReplyAuthorName?: (userId: string) => string;
  /** Whether dark mode is active — drives the embedded reply block's background. */
  isDark?: boolean;
};

function ChatMessageRowInner({
  item,
  nextMsg,
  currentUserId,
  theme,
  onLongPress,
  onRetry,
  onImagePress,
  getMessageTime,
  getDateDivider,
  shouldShowDateDivider,
  onReplyQuotePress,
  getReplyAuthorName,
  isDark = false,
}: ChatMessageRowProps) {
  const isCurrentUser = item.user_id === currentUserId;
  const sendStatus = item.sendStatus;
  const isHiddenForCurrentUser = currentUserId
    ? isDeletedForViewer(item, currentUserId)
    : false;
  const showTombstone = isDeletedForEveryone(item);

  if (isHiddenForCurrentUser) {
    return null;
  }

  const showDateDivider = shouldShowDateDivider(item, nextMsg);

  // Show the reply block whenever reply_to_id is set (it survived the refetch).
  // We also require the join data (replyToMessage) to show rich content, but
  // fall back to a minimal placeholder if the join returned null so the reply
  // container is never silently dropped.
  const hasReply = !!(item.reply_to_id && !showTombstone);
  const hasReplyData = hasReply && !!item.replyToMessage;

  const formattedTime = getMessageTime(item.created_at);
  // Timestamp colors: muted-white on own turquoise bg, secondaryText on partner bg.
  const timeColor = isCurrentUser
    ? "rgba(255,255,255,0.65)"
    : theme.secondaryText;

  const replyBlock = hasReply ? (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[
        replyQuoteStyles.container,
        isCurrentUser
          ? replyQuoteStyles.containerCurrentUser
          : {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.10)"
              : "rgba(0,0,0,0.06)",
          },
      ]}
      onPress={() => {
        if (item.reply_to_id && onReplyQuotePress) {
          onReplyQuotePress(item.reply_to_id);
        }
      }}
      disabled={!onReplyQuotePress || !item.reply_to_id}
    >
      <View
        style={[
          replyQuoteStyles.accentBar,
          {
            backgroundColor: isCurrentUser
              ? "rgba(255,255,255,0.7)"
              : "#2FC9C1",
          },
        ]}
      />
      <View style={replyQuoteStyles.textBlock}>
        <Text
          style={[
            replyQuoteStyles.authorName,
            { color: isCurrentUser ? "rgba(255,255,255,0.9)" : "#2FC9C1" },
          ]}
          numberOfLines={1}
        >
          {hasReplyData
            ? getReplyAuthorName
              ? getReplyAuthorName(item.replyToMessage!.user_id)
              : item.replyToMessage!.user_id === currentUserId
                ? "You"
                : "User"
            : "Reply"}
        </Text>
        <Text
          style={[
            replyQuoteStyles.contentSnippet,
            {
              color: isCurrentUser
                ? "rgba(255,255,255,0.75)"
                : theme.secondaryText,
            },
          ]}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {hasReplyData
            ? item.replyToMessage!.image_url && !item.replyToMessage!.content
              ? "📷 Image"
              : item.replyToMessage!.content || "📷 Image"
            : "(Original message)"}
        </Text>
      </View>
    </TouchableOpacity>
  ) : null;

  return (
    <>
      <Pressable
        style={[
          chatDetailStyles.messageContainer,
          isCurrentUser
            ? chatDetailStyles.currentUserMessage
            : chatDetailStyles.otherUserMessage,
          // Larger gap when the message above is from the opposite side (e.g. partner → me)
          nextMsg &&
          nextMsg.user_id !== item.user_id &&
          inlineTimestampStyles.messageGapAfterOtherSender,
        ]}
        onLongPress={() => onLongPress(item)}
        onPress={() => {
          if (sendStatus === "failed") {
            onRetry(item.id);
          }
        }}
      >
        {/* Bubble — fully rounded, no tails */}
        <View
          style={[
            chatDetailStyles.messageBubble,
            {
              backgroundColor: "transparent",
              borderRadius: 20,
              paddingHorizontal: 0,
              paddingVertical: 0,
              overflow: "hidden" as const,
              minWidth: hasReply ? REPLY_BLOCK_MIN_WIDTH : undefined,
            },
          ]}
        >
          {/* Reply quote — only present when hasReply is true */}
          {replyBlock}

          {item.image_url && !showTombstone && (
            <Pressable
              style={[
                chatDetailStyles.messageImageContainer,
                item.content
                  ? chatDetailStyles.messageImageContainerWithText
                  : undefined,
                // Need relative positioning so the pill timestamp can sit over the image
                !item.content ? { position: "relative" as const } : undefined,
              ]}
              onPress={() =>
                !item.id.startsWith("temp-") &&
                item.image_url &&
                onImagePress(item.image_url)
              }
            >
              {item.id.startsWith("temp-") ? (
                <View
                  style={[
                    chatDetailStyles.messageImage,
                    chatDetailStyles.messageImageLoading,
                  ]}
                >
                  <ActivityIndicator size="large" color="#999" />
                </View>
              ) : (
                <SupabaseImage
                  path={item.image_url}
                  bucket="chat-images"
                  style={chatDetailStyles.messageImage}
                  loadingBackgroundColor="#FFFFFF"
                  loadingIndicatorColor="#999"
                />
              )}
              {/* Image-only: float timestamp pill over bottom-right corner */}
              {!item.content && (
                <View style={inlineTimestampStyles.imagePill}>
                  <Text
                    style={inlineTimestampStyles.imagePillText}
                    numberOfLines={1}
                  >
                    {formattedTime}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
          {item.content && (
            <View
              style={[
                chatDetailStyles.messageTextWrap,
                {
                  backgroundColor: showTombstone
                    ? theme.card
                    : isCurrentUser
                      ? sendStatus === "failed"
                        ? "#B91C1C"
                        : "#5DBEBC"
                      : theme.messageBubble,
                  paddingHorizontal: 16,
                  paddingTop: 3,
                  paddingBottom: 3,
                  // Ensure bubble is tall enough so the timestamp (absolute bottom) is never clipped
                  minHeight: 39,
                  // Ensure bubble is wide enough for short messages (e.g. "1", "hi") + timestamp
                  minWidth: 80,
                  borderBottomLeftRadius: 20,
                  borderBottomRightRadius: 20,
                  borderTopLeftRadius:
                    (item.image_url && !showTombstone) || hasReply ? 0 : 20,
                  borderTopRightRadius:
                    (item.image_url && !showTombstone) || hasReply ? 0 : 20,
                  position: "relative" as const,
                },
                item.image_url &&
                !showTombstone &&
                chatDetailStyles.messageTextWrapWithImage,
              ]}
            >
              <Text
                style={[
                  chatDetailStyles.messageText,
                  {
                    color: showTombstone
                      ? theme.secondaryText
                      : isCurrentUser
                        ? "#FFFFFF"
                        : theme.text,
                    fontStyle: showTombstone ? "italic" : "normal",
                  },
                ]}
              >
                {showTombstone ? deletedLabel(item) : item.content}
              </Text>
              {/* Inline timestamp — absolute bottom-right, half above / half below last line */}
              <Text
                style={[
                  inlineTimestampStyles.textBubbleTime,
                  { color: timeColor },
                ]}
                numberOfLines={1}
              >
                {formattedTime}
              </Text>
            </View>
          )}
        </View>
        {isCurrentUser && sendStatus === "failed" && (
          <Text
            style={[chatDetailStyles.failedStatusText, { color: "#EF4444" }]}
          >
            Failed to send. Tap to retry.
          </Text>
        )}
      </Pressable>
      {showDateDivider && (
        <View style={chatDetailStyles.dateDividerContainer}>
          <View
            style={[
              chatDetailStyles.dateDivider,
              { backgroundColor: theme.border },
            ]}
          >
            <Text
              style={[
                chatDetailStyles.dateDividerText,
                { color: theme.secondaryText },
              ]}
            >
              {getDateDivider(item.created_at)}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

function areMessageRowPropsEqual(
  prev: ChatMessageRowProps,
  next: ChatMessageRowProps,
): boolean {
  return (
    prev.item === next.item &&
    prev.nextMsg === next.nextMsg &&
    prev.currentUserId === next.currentUserId &&
    prev.isDark === next.isDark &&
    prev.theme === next.theme
  );
}

export const ChatMessageRow = memo(ChatMessageRowInner, areMessageRowPropsEqual);

/** Inline timestamp styles used for WhatsApp-style time inside the bubble. */
const inlineTimestampStyles = StyleSheet.create({
  // Extra gap above this message when the one above is from the other sender (partner → me or me → partner).
  messageGapAfterOtherSender: {
    marginTop: 12,
  },
  // Absolute bottom-right; half above / half below last line via paddingBottom 8 on text-wrap.
  textBubbleTime: {
    position: "absolute",
    bottom: 0,
    right: 12,
    // marginLeft: 4,
    fontSize: 10,
    fontFamily: "Poppins_400Regular",
    lineHeight: 17,
  },
  // Semi-transparent pill that overlays the image for image-only messages.
  imagePill: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imagePillText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "#FFFFFF",
    lineHeight: 16,
  },
});

/**
 * The reply block has a fixed width so the outer bubble is always at least
 * this wide, preventing short replies from squishing the embedded quote.
 * ~45 chars × ~6.5px (fontSize 11) + accent bar + padding ≈ 290dp.
 */
const REPLY_BLOCK_MIN_WIDTH = 290;

const replyQuoteStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "stretch",
    // No borderRadius — the outer bubble’s overflow:hidden clips corners.
    // alignSelf:stretch (RN default in a column container) makes this fill
    // the full bubble width so long messages don't leave the reply block narrow.
    overflow: "hidden",
    paddingVertical: 6,
    paddingRight: 10,
  },
  containerCurrentUser: {
    backgroundColor: "#28B3AC",
  },
  accentBar: {
    width: 3,
    borderRadius: 2,
    marginHorizontal: 8,
    alignSelf: "stretch",
    minHeight: 28,
  },
  textBlock: {
    // flex:1 fills the remaining width after the accent bar (3+8+8 = 19dp).
    flex: 1,
    justifyContent: "center",
  },
  authorName: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 1,
  },
  contentSnippet: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
});
