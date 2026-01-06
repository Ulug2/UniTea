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
import ChatListSkeleton from "../../../components/ChatListSkeleton";
import { Ionicons } from "@expo/vector-icons";
import { Tables } from "../../../types/database.types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useMemo, useState, useEffect } from "react";

type Chat = Tables<"chats">;
type User = Tables<"profiles">;

// Type for the optimized view
type ChatSummary = {
  chat_id: string;
  participant_1_id: string;
  participant_2_id: string;
  post_id: string | null;
  created_at: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  unread_count_p1: number;
  unread_count_p2: number;
};

export default function ChatScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  // Fetch chats using optimized view - server-side filtering
  const {
    data: chatSummaries = [],
    refetch: refetchChats,
    isRefetching: isRefetchingChats,
    isLoading: isLoadingChats,
  } = useQuery<ChatSummary[]>({
    queryKey: ["chat-summaries", currentUserId, searchQuery],
    queryFn: async () => {
      if (!currentUserId) return [];

      // Type cast needed since view isn't in generated types
      let query = (supabase as any)
        .from("user_chats_summary")
        .select("*")
        .or(
          `participant_1_id.eq.${currentUserId},participant_2_id.eq.${currentUserId}`
        )
        .order("last_message_at", { ascending: false, nullsFirst: false });

      // Server-side search filtering
      if (searchQuery.trim()) {
        query = query.ilike("last_message_content", `%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as ChatSummary[];
    },
    enabled: Boolean(currentUserId),
    staleTime: 1000 * 30, // Summaries stay fresh for 30 seconds
    gcTime: 1000 * 60 * 15, // Cache for 15 minutes
    retry: 2,
  });

  // Real-time subscription for chat updates
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel("chats-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chats",
        },
        (payload) => {
          // Refetch chat summaries when any chat is updated
          queryClient.invalidateQueries({ queryKey: ["chat-summaries", currentUserId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chats",
        },
        (payload) => {
          // Refetch when new chat is created
          queryClient.invalidateQueries({ queryKey: ["chat-summaries", currentUserId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, queryClient]);

  // Get all unique participant IDs (excluding anonymous)
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    (chatSummaries as ChatSummary[]).forEach((chat: ChatSummary) => {
      ids.add(chat.participant_1_id);
      ids.add(chat.participant_2_id);
    });
    return Array.from(ids).filter((id: string) => !id.startsWith("anonymous-"));
  }, [chatSummaries]);

  // Fetch all participant profiles
  const { data: users = [], isLoading: isLoadingUsers } = useQuery<User[]>({
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

  const getOtherUser = (
    chat: ChatSummary
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

  // Get unread count based on which participant is current user
  const getUnreadCount = (chat: ChatSummary): number => {
    return chat.participant_1_id === currentUserId
      ? chat.unread_count_p1
      : chat.unread_count_p2;
  };

  // Client-side username filtering (in addition to server-side message search)
  const filteredChats = useMemo(() => {
    const summaries = chatSummaries as ChatSummary[];
    if (!searchQuery.trim()) return summaries;

    const query = searchQuery.toLowerCase();
    return summaries.filter((chat: ChatSummary) => {
      const { user, isAnonymous } = getOtherUser(chat);
      const username = isAnonymous
        ? "anonymous"
        : user?.username?.toLowerCase() || "";

      // Username matching (server already filters messages)
      return username.includes(query);
    });
  }, [chatSummaries, searchQuery, users, currentUserId]);

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
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 100,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: "Poppins_400Regular",
    },
  });

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.secondaryText} />
        <TextInput
          placeholder="Search conversations..."
          placeholderTextColor={theme.secondaryText}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
    </View>
  );

  // Show skeleton while loading initial data (including users to prevent flicker)
  if (isLoadingChats || (isLoadingUsers && chatSummaries.length > 0)) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <ChatListSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.chat_id}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => {
          const { user, isAnonymous } = getOtherUser(item);
          return (
            <ChatListItem
              chatId={item.chat_id}
              lastMessageAt={item.last_message_at}
              otherUser={user}
              lastMessage={item.last_message_content || ""}
              unreadCount={getUnreadCount(item)}
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
        contentContainerStyle={filteredChats.length === 0 ? { flexGrow: 1 } : undefined}
        contentInsetAdjustmentBehavior="automatic"
      />
    </View>
  );
}
