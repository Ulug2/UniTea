import React, { forwardRef } from "react";
import {
  ActivityIndicator,
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
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

type CommentComposerProps = {
  theme: Theme;
  /** Bottom safe area inset (e.g. home indicator / gesture nav) for edge-to-edge layouts */
  insetsBottom: number;
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

/** Extra space below the input row when the home inset is applied by the parent. */
const COMPOSER_BOTTOM_GAP = verticalScale(8);
/** When keyboard is open, `insetsBottom` is 0 — keep a modest lift above the IME. */
const COMPOSER_BOTTOM_GAP_KEYBOARD = verticalScale(12);

export const CommentComposer = forwardRef<TextInput, CommentComposerProps>(
  function CommentComposer(
    {
      theme,
      insetsBottom,
      commentText,
      onChangeText,
      onSubmit,
      onCancelReply,
      isAnonymousMode,
      onToggleAnonymous,
      replyingToUsername,
      isSubmitting,
      currentUserLabel,
    },
    ref,
  ) {
    const disabled = !commentText.trim() || isSubmitting;

    return (
      <View
        style={[
          styles.commentInputContainer,
          {
            borderTopColor: theme.border,
            backgroundColor: theme.card,
            paddingBottom:
              insetsBottom > 0
                ? insetsBottom + COMPOSER_BOTTOM_GAP
                : COMPOSER_BOTTOM_GAP_KEYBOARD,
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
              <Ionicons name="person" size={moderateScale(20)} color={theme.text} />
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
              style={[styles.replyingToText, { color: theme.secondaryText }]}
            >
              Replying to{" "}
              <Text style={{ fontWeight: "600" }}>{replyingToUsername}</Text>
            </Text>
            <Pressable onPress={onCancelReply} style={styles.cancelReplyButton}>
              <MaterialCommunityIcons
                name="close"
                size={moderateScale(16)}
                color={theme.secondaryText}
              />
            </Pressable>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            ref={ref}
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
              <MaterialCommunityIcons name="send" size={moderateScale(20)} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    );
  },
);

CommentComposer.displayName = "CommentComposer";

const styles = StyleSheet.create({
  commentInputContainer: {
    borderTopWidth: 1,
    paddingHorizontal: scale(10),
    paddingTop: verticalScale(10),
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    shadowOffset: {
      width: 0,
      height: verticalScale(-3),
    },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(3),
    elevation: 10,
    width: "100%",
  },
  anonymousRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    marginBottom: verticalScale(8),
  },
  anonymousToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(8),
  },
  anonymousToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(4),
  },
  toggleAvatar: {
    width: scale(30),
    height: verticalScale(30),
    borderRadius: moderateScale(15),
  },
  anonymousText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_500Medium",
  },
  replyingToContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    marginBottom: verticalScale(8),
    backgroundColor: "transparent",
  },
  replyingToText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
  },
  cancelReplyButton: {
    padding: moderateScale(4),
  },
  cancelReplyText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: moderateScale(10),
  },
  commentInput: {
    flex: 1,
    padding: moderateScale(12),
    borderRadius: moderateScale(20),
    fontSize: moderateScale(15),
    minHeight: verticalScale(40),
    maxHeight: verticalScale(100),
    fontFamily: "Poppins_400Regular",
    marginLeft: scale(5),
  },
  replyButton: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: moderateScale(20),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: verticalScale(2),
  },
});
