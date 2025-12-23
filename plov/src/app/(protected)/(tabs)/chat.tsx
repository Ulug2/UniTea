import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import ChatListItem from "../../../components/ChatListItem";
import { Ionicons } from "@expo/vector-icons";
import { Tables } from "../../../types/database.types";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useMemo } from "react";

type Chat = Tables<"chats">;
type ChatMessage = Tables<"chat_messages">;
type User = Tables<"profiles">;

export default function ChatScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  // Fetch chats where current user is a participant
  const {
    data: chats = [],
    refetch: refetchChats,
    isRefetching: isRefetchingChats,
  } = useQuery<Chat[]>({
    queryKey: ["chats", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];

      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .or(
          `participant_1_id.eq.${currentUserId},participant_2_id.eq.${currentUserId}`
        )
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(currentUserId),
  });

  // Get all chat IDs for batch queries
  const chatIds = chats.map((c) => c.id);

  // Fetch all messages for user's chats
  const { data: chatMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", chatIds],
    queryFn: async () => {
      if (chatIds.length === 0) return [];

      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: chatIds.length > 0,
    staleTime: 1000 * 10, // Messages stay fresh for 10 seconds
    gcTime: 1000 * 60 * 15, // Cache for 15 minutes
    refetchInterval: 5000, // Poll every 5 seconds for new messages
    retry: 2,
  });

  // Get all unique participant IDs
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    chats.forEach((chat) => {
      ids.add(chat.participant_1_id);
      ids.add(chat.participant_2_id);
    });
    return Array.from(ids).filter((id) => !id.startsWith("anonymous-"));
  }, [chats]);

  // Fetch all participant profiles
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["chat-users", participantIds],
    queryFn: async () => {
      if (participantIds.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", participantIds);

      if (error) throw error;
      return data || [];
    },
    enabled: participantIds.length > 0,
    staleTime: 1000 * 60 * 30, // User profiles stay fresh for 30 minutes
    gcTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 2,
  });

  // Calculate last message for each chat
  const lastMessageMap = useMemo(() => {
    const map = new Map<string, string>();
    chatMessages.forEach((msg) => {
      if (!map.has(msg.chat_id)) {
        map.set(msg.chat_id, msg.content);
      }
    });
    return map;
  }, [chatMessages]);

  // Calculate unread count for each chat
  const unreadCountMap = useMemo(() => {
    const map = new Map<string, number>();
    chatMessages.forEach((msg) => {
      if (!msg.is_read && msg.user_id !== currentUserId) {
        const currentCount = map.get(msg.chat_id) || 0;
        map.set(msg.chat_id, currentCount + 1);
      }
    });
    return map;
  }, [chatMessages, currentUserId]);

  // Get last message for each chat
  const getLastMessage = (chatId: string): string => {
    return lastMessageMap.get(chatId) || "";
  };

  // Get unread count for each chat
  const getUnreadCount = (chatId: string): number => {
    return unreadCountMap.get(chatId) || 0;
  };

  const getOtherUser = (
    chat: Chat
  ): { user: User | null; isAnonymous: boolean } => {
    const otherUserId =
      chat.participant_1_id === currentUserId
        ? chat.participant_2_id
        : chat.participant_1_id;

    const isAnonymous = otherUserId.startsWith("anonymous-");

    if (isAnonymous) {
      return { user: null, isAnonymous: true };
    }

    const user = users.find((u) => u.id === otherUserId) || null;
    return { user, isAnonymous: false };
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 10,
      backgroundColor: theme.background,
    },
    title: {
      fontSize: 32,
      fontFamily: "Poppins_700Bold",
      color: theme.text,
      marginBottom: 16,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Poppins_400Regular",
      color: theme.text,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 100,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: "Poppins_400Regular",
    },
  });
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={theme.secondaryText} />
          <TextInput
            placeholder="Search conversations..."
            placeholderTextColor={theme.secondaryText}
            style={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const { user, isAnonymous } = getOtherUser(item);
          return (
            <ChatListItem
              chat={item}
              otherUser={user}
              lastMessage={getLastMessage(item.id)}
              unreadCount={getUnreadCount(item.id)}
              isAnonymous={isAnonymous}
            />
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingChats}
            onRefresh={refetchChats}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
              No conversations yet
            </Text>
          </View>
        }
      />
    </View>
  );
}
