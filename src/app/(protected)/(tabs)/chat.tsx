import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import ChatListItem from "../../../components/ChatListItem";
import ChatListSkeleton from "../../../components/ChatListSkeleton";
import { Database } from "../../../types/database.types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useMemo, useEffect, useRef, useCallback } from "react";

type Chat = Database["public"]["Tables"]["chats"]["Row"];
type User = Database["public"]["Tables"]["profiles"]["Row"];

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
  const queryClient = useQueryClient();

  // Debounce refs to prevent cascading invalidations
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const updateDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Fetch blocked users to filter chats
  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", currentUserId],
    enabled: Boolean(currentUserId),
    queryFn: async () => {
      if (!currentUserId) return [];

      // Get users blocked by me and users who blocked me
      const [blockedByMe, blockedMe] = await Promise.all([
        supabase
          .from("blocks")
          .select("blocked_id")
          .eq("blocker_id", currentUserId),
        supabase
          .from("blocks")
          .select("blocker_id")
          .eq("blocked_id", currentUserId),
      ]);

      const blockedUserIds = new Set<string>();
      blockedByMe.data?.forEach((b) => blockedUserIds.add(b.blocked_id));
      blockedMe.data?.forEach((b) => blockedUserIds.add(b.blocker_id));

      return Array.from(blockedUserIds);
    },
    staleTime: 1000 * 60 * 5, // Blocks stay fresh for 5 minutes
    gcTime: 1000 * 60 * 30,
  });

  // Fetch chats using optimized view - no search in query key to prevent refetching
  const {
    data: chatSummaries = [],
    refetch: refetchChats,
    isRefetching: isRefetchingChats,
    isLoading: isLoadingChats,
  } = useQuery<ChatSummary[]>({
    queryKey: ["chat-summaries", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];

      // Type cast needed since view isn't in generated types
      const { data, error } = await (supabase as any)
        .from("user_chats_summary")
        .select("*")
        .or(
          `participant_1_id.eq.${currentUserId},participant_2_id.eq.${currentUserId}`
        )
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data || []) as ChatSummary[];
    },
    enabled: Boolean(currentUserId),
    staleTime: 1000 * 30, // Summaries stay fresh for 30 seconds
    gcTime: 1000 * 60 * 15, // Cache for 15 minutes
    retry: 2,
  });

  // Filter out chats with blocked users and ensure deleted chats are removed
  const filteredChatSummaries = useMemo(() => {
    if (!chatSummaries || chatSummaries.length === 0) return [];
    if (!currentUserId) return [];

    return chatSummaries.filter((chat: ChatSummary) => {
      // Filter out chats with blocked users (both ways)
      const otherUserId =
        chat.participant_1_id === currentUserId
          ? chat.participant_2_id
          : chat.participant_1_id;

      if (blocks.includes(otherUserId)) {
        return false;
      }

      // Additional safety check - ensure chat_id exists
      if (!chat.chat_id) {
        return false;
      }

      return true;
    });
  }, [chatSummaries, blocks, currentUserId]);

  // Real-time subscription for chat updates with debouncing to prevent cascading invalidations
  useEffect(() => {
    if (!currentUserId) return;

    // Track if component is still mounted
    let isMounted = true;

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
          // Debounce chat updates (less frequent)
          if (updateDebounceRef.current) {
            clearTimeout(updateDebounceRef.current);
          }
          updateDebounceRef.current = setTimeout(() => {
            if (isMounted) {
              queryClient.invalidateQueries({
                queryKey: ["chat-summaries", currentUserId],
              });
            }
          }, 1000);
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
          // New chat created - invalidate immediately (rare event)
          if (isMounted) {
            queryClient.invalidateQueries({
              queryKey: ["chat-summaries", currentUserId],
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          // Skip our own messages entirely - they're handled by optimistic updates
          // Don't process, don't debounce, just skip immediately
          const newMessage = payload.new as any;
          if (newMessage.user_id === currentUserId) {
            return; // Exit immediately - no processing needed
          }

          // Only debounce OTHER users' messages to batch rapid sends (500ms)
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          debounceRef.current = setTimeout(() => {
            if (isMounted) {
              queryClient.invalidateQueries({
                queryKey: ["chat-summaries", currentUserId],
              });
            }
          }, 500);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
        },
        () => {
          // Debounce message updates (read status changes)
          if (updateDebounceRef.current) {
            clearTimeout(updateDebounceRef.current);
          }
          updateDebounceRef.current = setTimeout(() => {
            if (isMounted) {
              queryClient.invalidateQueries({
                queryKey: ["chat-summaries", currentUserId],
              });
            }
          }, 1000);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chats",
        },
        (payload) => {
          if (!isMounted) return;

          // Chat deleted - optimistically remove from cache immediately
          const deletedChatId = payload.old?.id;
          if (deletedChatId) {
            queryClient.setQueryData<any[]>(
              ["chat-summaries", currentUserId],
              (oldSummaries: any[] | undefined) => {
                if (!oldSummaries) return oldSummaries;
                return oldSummaries.filter(
                  (summary: any) => summary.chat_id !== deletedChatId
                );
              }
            );
          }

          // Invalidate to ensure consistency
          queryClient.invalidateQueries({
            queryKey: ["chat-summaries", currentUserId],
            refetchType: "none", // Don't refetch - optimistic update already applied
          });
          queryClient.invalidateQueries({
            queryKey: ["global-unread-count", currentUserId],
            refetchType: "none",
          });
        }
      )
      .subscribe();

    return () => {
      // Mark as unmounted FIRST to prevent any queued operations
      isMounted = false;

      // Cleanup timeouts on unmount
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      if (updateDebounceRef.current) {
        clearTimeout(updateDebounceRef.current);
        updateDebounceRef.current = undefined;
      }

      // Unsubscribe from channel
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

  const getOtherUser = useCallback((
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
  }, [currentUserId, users]);

  // Get unread count based on which participant is current user
  const getUnreadCount = useCallback((chat: ChatSummary): number => {
    return chat.participant_1_id === currentUserId
      ? chat.unread_count_p1
      : chat.unread_count_p2;
  }, [currentUserId]);

  // Render function for FlatList - must be defined at component level (Rules of Hooks)
  const renderChatItem = useCallback(
    ({ item }: { item: ChatSummary }) => {
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
    },
    [getOtherUser, getUnreadCount]
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
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

  // Show skeleton while loading initial data (including users to prevent flicker)
  if (isLoadingChats || (isLoadingUsers && filteredChatSummaries.length > 0)) {
    return (
      <View style={styles.container}>
        <ChatListSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredChatSummaries}
        keyExtractor={(item) => item.chat_id}
        renderItem={renderChatItem}
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
        contentContainerStyle={
          filteredChatSummaries.length === 0 ? { flexGrow: 1 } : undefined
        }
        contentInsetAdjustmentBehavior="automatic"
      />
    </View>
  );
}
