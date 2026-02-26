import React from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReplyingToState } from "../types";

type ChatComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPickImage: () => void;
  selectedImageUri: string | null;
  onRemoveImage: () => void;
  isSending: boolean;
  disabled: boolean;
  placeholder?: string;
  textColor: string;
  placeholderColor: string;
  primaryColor?: string;
  /** Background color for the reply preview strip (pass theme.card). */
  replyPreviewBg?: string;
  /** Border color for the reply preview strip top border (pass theme.border). */
  replyPreviewBorderColor?: string;
  /** Set when the user is composing a reply to a specific message. */
  replyingTo?: ReplyingToState | null;
  onCancelReply?: () => void;
  styles: {
    inputContainer: StyleProp<ViewStyle>;
    input: StyleProp<ViewStyle>;
    sendButton: StyleProp<ViewStyle>;
    imagePickerButton: StyleProp<ViewStyle>;
    imagePreviewContainer: StyleProp<ViewStyle>;
    imagePreview: StyleProp<import("react-native").ImageStyle>;
    removeImageButton: StyleProp<ViewStyle>;
  };
  paddingBottom?: number;
};

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onPickImage,
  selectedImageUri,
  onRemoveImage,
  isSending,
  disabled,
  placeholder = "Type a message...",
  textColor,
  placeholderColor,
  primaryColor = "#2FC9C1",
  replyPreviewBg = "#F8F9FB",
  replyPreviewBorderColor = "#E5E7EB",
  replyingTo,
  onCancelReply,
  styles: styleSet,
  paddingBottom = 0,
}: ChatComposerProps) {
  // Derive preview content label
  const replyContentLabel = replyingTo
    ? replyingTo.message.image_url && !replyingTo.message.content
      ? "\uD83D\uDCF7 Image"
      : replyingTo.message.content
        ? replyingTo.message.content.length > 80
          ? replyingTo.message.content.slice(0, 80) + "\u2026"
          : replyingTo.message.content
        : "\uD83D\uDCF7 Image"
    : null;

  return (
    <>
      {/* Reply preview strip */}
      {replyingTo && (
        <View
          style={[
            replyStyles.replyPreviewContainer,
            {
              backgroundColor: replyPreviewBg,
              borderTopColor: replyPreviewBorderColor,
            },
          ]}
        >
          <View
            style={[
              replyStyles.replyAccentBar,
              { backgroundColor: primaryColor },
            ]}
          />
          <View style={replyStyles.replyTextBlock}>
            <Text
              style={[replyStyles.replySenderName, { color: primaryColor }]}
              numberOfLines={1}
            >
              {replyingTo.senderName}
            </Text>
            <Text style={replyStyles.replyContentText} numberOfLines={1}>
              {replyContentLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onCancelReply}
            style={replyStyles.replyCancelButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}

      {/* Attached image preview */}
      {selectedImageUri && (
        <View style={styleSet.imagePreviewContainer}>
          <Image
            source={{ uri: selectedImageUri }}
            style={styleSet.imagePreview}
          />
          <Pressable style={styleSet.removeImageButton} onPress={onRemoveImage}>
            <Ionicons name="close-circle" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {/* Input row */}
      <View style={[styleSet.inputContainer, { paddingBottom }]}>
        <Pressable style={styleSet.imagePickerButton} onPress={onPickImage}>
          <Ionicons name="image-outline" size={24} color={textColor} />
        </Pressable>
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          value={value}
          onChangeText={onChangeText}
          style={styleSet.input}
          multiline
          maxLength={1000}
        />
        <Pressable
          onPress={onSend}
          style={[
            styleSet.sendButton,
            { opacity: disabled || isSending ? 0.5 : 1 },
          ]}
          disabled={disabled || isSending}
        >
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </>
  );
}

const replyStyles = StyleSheet.create({
  replyPreviewContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    // borderTopColor and backgroundColor are applied inline (theme-aware)
    gap: 8,
  },
  replyAccentBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: "stretch",
    minHeight: 32,
  },
  replyTextBlock: {
    flex: 1,
  },
  replySenderName: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 1,
  },
  replyContentText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "#6B7280",
  },
  replyCancelButton: {
    padding: 4,
  },
});
