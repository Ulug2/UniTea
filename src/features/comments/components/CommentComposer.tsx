import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Switch,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import type { Theme } from "../../../context/ThemeContext";

type CommentComposerProps = {
  theme: Theme;
  insetsTop: number;
  commentText: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onCancelReply: () => void;
  isAnonymousMode: boolean;
  onToggleAnonymous: () => void;
  replyingToUsername: string | null;
  isSubmitting: boolean;
  currentUserLabel: string;
};

export function CommentComposer({
  theme,
  insetsTop,
  commentText,
  onChangeText,
  onSubmit,
  onCancelReply,
  isAnonymousMode,
  onToggleAnonymous,
  replyingToUsername,
  isSubmitting,
  currentUserLabel,
}: CommentComposerProps) {
  const disabled = !commentText.trim() || isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insetsTop + 44 : insetsTop}
    >
      <View
        style={[
          styles.commentInputContainer,
          {
            borderTopColor: theme.border,
            backgroundColor: theme.card,
          },
        ]}
      >
        {/* Anonymous Toggle */}
        <View style={styles.anonymousRow}>
          <View style={styles.anonymousToggleLeft}>
            {isAnonymousMode ? (
              <Image
                source={require("../../../../assets/images/nu-logo.png")}
                style={styles.toggleAvatar}
              />
            ) : (
              <Ionicons name="person" size={20} color={theme.text} />
            )}
            <Text style={[styles.anonymousText, { color: theme.text }]}>
              {isAnonymousMode ? "Anonymous" : `As ${currentUserLabel}`}
            </Text>
          </View>
          <Switch
            value={isAnonymousMode}
            onValueChange={onToggleAnonymous}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={"white"}
          />
        </View>
        {/* Reply indicator */}
        {replyingToUsername && (
          <View style={styles.replyingToContainer}>
            <Text
              style={[
                styles.replyingToText,
                { color: theme.secondaryText },
              ]}
            >
              Replying to{" "}
              <Text style={{ fontWeight: "600" }}>{replyingToUsername}</Text>
            </Text>
            <Pressable onPress={onCancelReply} style={styles.cancelReplyButton}>
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
            style={[
              styles.commentInput,
              {
                backgroundColor: theme.background,
                color: theme.text,
              },
            ]}
            placeholder={
              replyingToUsername
                ? `Reply to ${replyingToUsername}...`
                : "Comment..."
            }
            placeholderTextColor={theme.secondaryText}
            value={commentText}
            onChangeText={onChangeText}
            multiline
          />
          <Pressable
            disabled={disabled}
            onPress={onSubmit}
            style={[
              styles.replyButton,
              {
                backgroundColor: disabled ? theme.border : theme.primary,
              },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  commentInputContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 22,
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
  anonymousRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  anonymousToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  anonymousToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  toggleAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  anonymousText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  replyingToContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    backgroundColor: "transparent",
  },
  replyingToText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  cancelReplyButton: {
    padding: 4,
  },
  cancelReplyText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  commentInput: {
    flex: 1,
    padding: 12,
    borderRadius: 20,
    fontSize: 15,
    minHeight: 40,
    maxHeight: 100,
    fontFamily: "Poppins_400Regular",
    marginLeft: 5,
  },
  replyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
});

