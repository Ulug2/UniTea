import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { Tables } from "../types/database.types";
import { useTheme } from "../context/ThemeContext";
import { formatDistanceToNowStrict } from "date-fns";
import { router } from "expo-router";
import SupabaseImage from "./SupabaseImage";

type Chat = Tables<"chats">;
type Profile = Tables<"profiles">;

type ChatListItemProps = {
  chat: Chat;
  otherUser: Profile | null;
  lastMessage: string;
  unreadCount: number;
  isAnonymous?: boolean;
};

export default function ChatListItem({
  chat,
  otherUser,
  lastMessage,
  unreadCount,
  isAnonymous,
}: ChatListItemProps) {
  const { theme } = useTheme();

  const getInitial = () => {
    if (isAnonymous || !otherUser?.username) return "?";
    return otherUser.username.charAt(0).toUpperCase();
  };

  const getDisplayName = () => {
    if (isAnonymous) {
      return `Anonymous User #${Math.floor(Math.random() * 9000) + 1000}`;
    }
    return otherUser?.username || "Unknown User";
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    );

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60)
      );
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: theme.card,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    avatarContainer: {
      position: "relative",
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isAnonymous ? "#2C3E50" : "#5DBEBC",
      justifyContent: "center",
      alignItems: "center",
    },
    avatarText: {
      fontSize: 24,
      color: "#FFFFFF",
      fontFamily: "Poppins_600SemiBold",
    },
    avatarImage: {
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    unreadBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      backgroundColor: "#5DBEBC",
      borderRadius: 12,
      minWidth: 24,
      height: 24,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 6,
    },
    unreadText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontFamily: "Poppins_600SemiBold",
    },
    contentContainer: {
      flex: 1,
      marginLeft: 14,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    username: {
      fontSize: 17,
      fontFamily: "Poppins_600SemiBold",
      color: theme.text,
    },
    time: {
      fontSize: 13,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
    },
    lastMessage: {
      fontSize: 15,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
    },
  });

  return (
    <Pressable
      style={styles.container}
      onPress={() => router.push(`/chat/${chat.id}`)}
    >
      <View style={styles.avatarContainer}>
        {otherUser?.avatar_url && !isAnonymous ? (
          otherUser.avatar_url.startsWith("http") ? (
            <Image
              source={{ uri: otherUser.avatar_url }}
              style={styles.avatarImage}
            />
          ) : (
            <SupabaseImage
              path={otherUser.avatar_url}
              bucket="avatars"
              style={styles.avatarImage}
            />
          )
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitial()}</Text>
          </View>
        )}
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={styles.username}>{getDisplayName()}</Text>
          <Text style={styles.time}>
            {chat.last_message_at ? formatTime(chat.last_message_at) : "No messages"}
          </Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {lastMessage}
        </Text>
      </View>
    </Pressable>
  );
}
