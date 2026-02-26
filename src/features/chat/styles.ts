import { StyleSheet } from "react-native";
import type { Theme } from "../../context/ThemeContext";
import type { EdgeInsets } from "react-native-safe-area-context";

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
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    backButton: {
      padding: 4,
      marginRight: 12,
    },
    avatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 16,
    },
    userName: {
      flex: 1,
      fontSize: 18,
      fontFamily: "Poppins_600SemiBold",
      color: theme.text,
    },
    menuButton: {
      padding: 4,
    },
    messagesList: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inputContainer: {
      flexDirection: "row" as const,
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: theme.card,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: 12,
    },
    input: {
      flex: 1,
      backgroundColor: theme.background,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Poppins_400Regular",
      color: theme.text,
      maxHeight: 100,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "#5DBEBC",
      justifyContent: "center",
      alignItems: "center",
    },
    imagePickerButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    imagePreviewContainer: {
      position: "relative" as const,
      marginHorizontal: 16,
      marginBottom: 8,
      alignSelf: "flex-start",
    },
    imagePreview: {
      width: 200,
      height: 200,
      borderRadius: 12,
      resizeMode: "cover" as const,
    },
    removeImageButton: {
      position: "absolute" as const,
      top: -8,
      right: -8,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      borderRadius: 12,
    },
  });
}

export const chatDetailStyles = StyleSheet.create({
  dateDividerContainer: {
    alignItems: "center",
    marginVertical: 16,
  },
  dateDivider: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dateDividerText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  messageContainer: {
    marginBottom: 4,
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
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
  },
  messageImageContainer: {
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 0,
    borderColor: "rgba(0, 0, 0, 0.1)",
    backgroundColor: "#FFFFFF",
  },
  messageImageContainerWithText: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  messageImage: {
    width: 250,
    height: 250,
  },
  messageImageLoading: {
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  messageTime: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 4,
    marginHorizontal: 4,
  },
  currentUserTime: {
    textAlign: "right",
  },
  failedStatusText: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    marginTop: 2,
    marginHorizontal: 4,
  },
  newMessagesPill: {
    position: "absolute",
    alignSelf: "center",
    bottom: 140,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#111827CC",
    zIndex: 5,
  },
  newMessagesPillText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
});
