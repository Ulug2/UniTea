import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { Database } from "../types/database.types";
import { useTheme } from "../context/ThemeContext";
import { router } from "expo-router";
import SupabaseImage from "./SupabaseImage";
import { formatDistanceToNowStrict } from "date-fns";

type Profile = Database['public']['Tables']['profiles']['Row'];

type ChatListItemProps = {
  chatId: string;
  lastMessageAt: string | null;
  otherUser: Profile | null;
  lastMessage: string;
  unreadCount: number;
  isAnonymous?: boolean;
};

// Custom comparison function for better memoization
const arePropsEqual = (prevProps: ChatListItemProps, nextProps: ChatListItemProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.lastMessageAt === nextProps.lastMessageAt &&
    prevProps.lastMessage === nextProps.lastMessage &&
    prevProps.unreadCount === nextProps.unreadCount &&
    prevProps.isAnonymous === nextProps.isAnonymous &&
    prevProps.otherUser?.id === nextProps.otherUser?.id &&
    prevProps.otherUser?.avatar_url === nextProps.otherUser?.avatar_url &&
    prevProps.otherUser?.username === nextProps.otherUser?.username
  );
};

const ChatListItem = React.memo(function ChatListItem({
  chatId,
  lastMessageAt,
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
      return `Anonymous User`;
    }
    return otherUser?.username || "Unknown User";
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return "";

    // formatDistanceToNowStrict with addSuffix: false gives "5 minutes", "2 hours"
    // We manually abbreviate to "5m", "2h" and ensure "ago" is not included.
    const distance = formatDistanceToNowStrict(new Date(dateString), { addSuffix: false });

    return distance
      .replace(" seconds", "s")
      .replace(" second", "s")
      .replace(" minutes", "m")
      .replace(" minute", "m")
      .replace(" hours", "h")
      .replace(" hour", "h")
      .replace(" days", "d")
      .replace(" day", "d")
      .replace(" months", "mo")
      .replace(" month", "mo")
      .replace(" years", "y")
      .replace(" year", "y");
  };

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
      alignItems: "center",
    },
    avatarContainer: {
      position: "relative",
      marginRight: 12,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarImage: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.border,
    },
    avatarText: {
      fontSize: 20,
      color: "#FFFFFF",
      fontFamily: "Poppins_700Bold",
    },
    unreadBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      backgroundColor: "#EF4444",
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: theme.card,
    },
    unreadText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontFamily: "Poppins_700Bold",
    },
    contentContainer: {
      flex: 1,
      justifyContent: "center",
      gap: 4,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    username: {
      fontSize: 16,
      fontFamily: "Poppins_600SemiBold",
      color: theme.text,
    },
    time: {
      fontSize: 12,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
    },
    lastMessage: {
      fontSize: 14,
      fontFamily: "Poppins_400Regular",
      color: unreadCount > 0 ? theme.text : theme.secondaryText,
      fontWeight: unreadCount > 0 ? "600" : "400",
    },
  });

  return (
    <Pressable
      style={styles.container}
      onPress={() => router.push(`/chat/${chatId}`)}
      android_ripple={{ color: theme.border }}
    >
      <View style={styles.avatarContainer}>
        {!isAnonymous && otherUser?.avatar_url ? (
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
            {lastMessageAt ? formatTime(lastMessageAt) : ""}
          </Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {lastMessage || "No messages yet"}
        </Text>
      </View>
    </Pressable>
  );
}, arePropsEqual);

export default ChatListItem;