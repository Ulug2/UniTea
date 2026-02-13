import React, { memo } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
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
  shouldShowDateDivider: (currentMsg: ChatMessageVM, nextMsg: ChatMessageVM | null) => boolean;
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

  return (
    <>
      <Pressable
        style={[
          chatDetailStyles.messageContainer,
          isCurrentUser ? chatDetailStyles.currentUserMessage : chatDetailStyles.otherUserMessage,
        ]}
        onLongPress={() => onLongPress(item)}
        onPress={() => {
          if (sendStatus === "failed") {
            onRetry(item.id);
          }
        }}
      >
        <View
          style={[
            chatDetailStyles.messageBubble,
            {
              backgroundColor: "transparent",
              borderRadius: 20,
              paddingHorizontal: 0,
              paddingVertical: 0,
              overflow: "hidden" as const,
            },
          ]}
        >
          {item.image_url && !showTombstone && (
            <Pressable
              style={[
                chatDetailStyles.messageImageContainer,
                item.content ? chatDetailStyles.messageImageContainerWithText : undefined,
              ]}
              onPress={() =>
                !item.id.startsWith("temp-") && item.image_url && onImagePress(item.image_url)
              }
            >
              {item.id.startsWith("temp-") ? (
                <View style={[chatDetailStyles.messageImage, chatDetailStyles.messageImageLoading]}>
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
                      : theme.card,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomLeftRadius: 20,
                  borderBottomRightRadius: 20,
                  borderTopLeftRadius: item.image_url && !showTombstone ? 0 : 20,
                  borderTopRightRadius: item.image_url && !showTombstone ? 0 : 20,
                },
                item.image_url && !showTombstone && chatDetailStyles.messageTextWrapWithImage,
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
            </View>
          )}
        </View>
        <Text
          style={[
            chatDetailStyles.messageTime,
            { color: theme.secondaryText },
            isCurrentUser && chatDetailStyles.currentUserTime,
          ]}
        >
          {getMessageTime(item.created_at)}
        </Text>
        {isCurrentUser && sendStatus === "failed" && (
          <Text style={[chatDetailStyles.failedStatusText, { color: "#EF4444" }]}>
            Failed to send. Tap to retry.
          </Text>
        )}
      </Pressable>
      {showDateDivider && (
        <View style={chatDetailStyles.dateDividerContainer}>
          <View
            style={[chatDetailStyles.dateDivider, { backgroundColor: theme.border }]}
          >
            <Text
              style={[chatDetailStyles.dateDividerText, { color: theme.secondaryText }]}
            >
              {getDateDivider(item.created_at)}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

export const ChatMessageRow = memo(ChatMessageRowInner);
