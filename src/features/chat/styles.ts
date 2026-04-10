import { StyleSheet } from "react-native";
import type { Theme } from "../../context/ThemeContext";
import type { EdgeInsets } from "react-native-safe-area-context";
import { moderateScale, scale, verticalScale } from "../../utils/scaling";

export function makeChatDetailStyles(
  theme: Theme,
  _isDark: boolean,
  insets: EdgeInsets
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: insets.top,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center",
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    backButton: {
      padding: moderateScale(4),
      marginRight: scale(12),
    },
    avatarImage: {
      width: scale(40),
      height: verticalScale(40),
      borderRadius: moderateScale(20),
      marginRight: scale(16),
    },
    userName: {
      flex: 1,
      fontSize: moderateScale(18),
      fontFamily: "Poppins_600SemiBold",
      color: theme.text,
    },
    menuButton: {
      padding: moderateScale(4),
    },
    messagesList: {
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
    },
    inputContainer: {
      flexDirection: "row" as const,
      alignItems: "center",
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(10),
      backgroundColor: theme.card,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: moderateScale(12),
    },
    input: {
      flex: 1,
      backgroundColor: theme.background,
      borderRadius: moderateScale(24),
      paddingHorizontal: scale(18),
      paddingVertical: verticalScale(12),
      fontSize: moderateScale(15),
      fontFamily: "Poppins_400Regular",
      color: theme.text,
      maxHeight: verticalScale(100),
    },
    sendButton: {
      width: scale(44),
      height: verticalScale(44),
      borderRadius: moderateScale(22),
      backgroundColor: "#5DBEBC",
      justifyContent: "center",
      alignItems: "center",
    },
    imagePickerButton: {
      width: scale(44),
      height: verticalScale(44),
      borderRadius: moderateScale(22),
      justifyContent: "center",
      alignItems: "center",
    },
    imagePreviewContainer: {
      position: "relative" as const,
      marginHorizontal: scale(16),
      marginBottom: verticalScale(8),
      alignSelf: "flex-start",
    },
    imagePreview: {
      width: scale(200),
      borderRadius: moderateScale(12),
    },
    removeImageButton: {
      position: "absolute" as const,
      top: verticalScale(-8),
      right: scale(-8),
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      borderRadius: moderateScale(12),
    },
  });
}

export const chatDetailStyles = StyleSheet.create({
  dateDividerContainer: {
    alignItems: "center",
    marginVertical: verticalScale(16),
  },
  dateDivider: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(16),
  },
  dateDividerText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
  messageContainer: {
    marginBottom: verticalScale(4),
    maxWidth: "75%",
  },
  currentUserMessage: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  otherUserMessage: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  messageBubble: {
    overflow: "hidden",
  },
  messageTextWrap: {},
  messageTextWrapWithImage: {
    justifyContent: "center",
    alignItems: "flex-start",
  },
  messageText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    lineHeight: moderateScale(20),
  },
  messageImageContainer: {
    overflow: "hidden",
    borderRadius: moderateScale(20),
    borderWidth: 0,
    borderColor: "rgba(0, 0, 0, 0.1)",
    backgroundColor: "#F3F4F6",
  },
  messageImageContainerWithText: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  messageImageLoading: {
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  messageImageLoadingSize: {
    width: scale(225),
    height: verticalScale(300),
  },
  messageTime: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    marginTop: verticalScale(4),
    marginHorizontal: scale(4),
  },
  currentUserTime: {
    textAlign: "right",
  },
  failedStatusText: {
    fontSize: moderateScale(11),
    fontFamily: "Poppins_400Regular",
    marginTop: verticalScale(2),
    marginHorizontal: scale(4),
  },
  newMessagesPill: {
    position: "absolute",
    alignSelf: "center",
    bottom: verticalScale(140),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
    backgroundColor: "#111827CC",
    zIndex: 5,
  },
  newMessagesPillText: {
    color: "#FFFFFF",
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
});
