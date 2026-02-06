import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import ChatListItem from "../../../components/ChatListItem";
import ChatListSkeleton from "../../../components/ChatListSkeleton";
import { Database } from "../../../types/database.types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useMemo, useEffect, useRef, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { logger } from "../../../utils/logger";
import { useBlocks } from "../../../hooks/useBlocks";

type Chat = Database["public"]["Tables"]["chats"]["Row"];
type User = Database["public"]["Tables"]["profiles"]["Row"];

// Type for the optimized view (last_message_has_image from view when available)
type ChatSummary = {
  chat_id: string;
  participant_1_id: string;
  participant_2_id: string;
  post_id: string | null;
  created_at: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_has_image?: boolean;
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
  const { data: blocks = [] } = useBlocks();

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

      if (error) {
        logger.error("Failed to fetch chat summaries", error, {
          userId: currentUserId,
          component: "ChatScreen",
        });
        throw error;
      }
      return (data || []) as ChatSummary[];
    },
    enabled: Boolean(currentUserId),
    staleTime: 1000 * 60 * 5, // Summaries stay fresh for 5 minutes - rely on cache and real-time updates
    gcTime: 1000 * 60 * 15, // Cache for 15 minutes
    refetchOnWindowFocus: false, // Don't refetch when window/tab gains focus
    refetchOnMount: false, // Don't refetch on mount if data exists (rely on cache + realtime)
    refetchOnReconnect: true, // Only refetch on reconnect (network came back)
    retry: (failureCount, error) => {
      // Log error on retry
      if (failureCount > 0) {
        logger.warn("Retrying chat summaries query", {
          userId: currentUserId,
          component: "ChatScreen",
          failureCount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return failureCount < 2; // Retry up to 2 times
    },
  });

  // Removed aggressive refetch on focus - rely on cache and real-time subscriptions instead
  // This prevents UI lag and scroll jumps when navigating back to the chat list
  
  // Prevent stuck loading state: cancel refetch if it's been stuck for too long
  useEffect(() => {
    if (isRefetchingChats) {
      const timeout = setTimeout(() => {
        // If still refetching after 10 seconds, something went wrong - cancel it
        queryClient.cancelQueries({ queryKey: ["chat-summaries", currentUserId] });
        logger.warn("Chat summaries refetch timed out - cancelled", {
          userId: currentUserId,
          component: "ChatScreen",
        });
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [isRefetchingChats, queryClient, currentUserId]);

  // Filter out chats with blocked users and ensure deleted chats are removed
  const filteredChatSummaries = useMemo(() => {
    if (!chatSummaries || chatSummaries.length === 0) return [];
    if (!currentUserId) return [];

    return chatSummaries.filter((chat: ChatSummary) => {
      // Only show chats that have at least one message (empty chats must not appear)
      if (!chat.last_message_at) {
        return false;
      }

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

  // Real-time subscription for chat updates - uses smart cache updates instead of invalidations
  // This prevents scroll jumps and UI lag by updating specific items without refetching
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
          if (!isMounted) return;
          try {
            const updatedChat = payload.new as any;

            // Smart update: only update the specific chat that changed
            queryClient.setQueryData<ChatSummary[]>(
              ["chat-summaries", currentUserId],
              (oldSummaries) => {
                if (!oldSummaries) return oldSummaries;

                // Find and update the specific chat
                const chatIndex = oldSummaries.findIndex(
                  (s) => s.chat_id === updatedChat.id
                );

                if (chatIndex === -1) {
                  // Chat not in list, might be new - invalidate to fetch
                  queryClient.invalidateQueries({
                    queryKey: ["chat-summaries", currentUserId],
                    refetchType: "none", // Don't refetch immediately
                  });
                  return oldSummaries;
                }

                // Update the specific chat's last_message_at if changed
                const updated = [...oldSummaries];
                updated[chatIndex] = {
                  ...updated[chatIndex],
                  last_message_at: updatedChat.last_message_at || updated[chatIndex].last_message_at,
                };

                // Re-sort by last_message_at (newest first)
                updated.sort((a, b) => {
                  const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                  const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                  return bTime - aTime;
                });

                return updated;
              }
            );
          } catch (error) {
            logger.error("Error updating chat cache (UPDATE event)", error, {
              userId: currentUserId,
              component: "ChatScreen",
              event: "chats.UPDATE",
              payload: payload.new,
            });
          }
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
          if (!isMounted) return;
          // New chat created - invalidate to fetch (rare event, acceptable)
          queryClient.invalidateQueries({
            queryKey: ["chat-summaries", currentUserId],
            refetchType: "none", // Don't refetch immediately, wait for next access
          });
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
          if (!isMounted) return;

          try {
            const newMessage = payload.new as any;

            // Skip our own messages - they're handled by optimistic updates
            if (newMessage.user_id === currentUserId) {
              return;
            }

            // Smart update: update the specific chat's last message info without refetching
            queryClient.setQueryData<ChatSummary[]>(
              ["chat-summaries", currentUserId],
              (oldSummaries) => {
                if (!oldSummaries) return oldSummaries;

                const chatIndex = oldSummaries.findIndex(
                  (s) => s.chat_id === newMessage.chat_id
                );

                if (chatIndex === -1) {
                  // Chat not in list - might be a new chat, invalidate to fetch
                  queryClient.invalidateQueries({
                    queryKey: ["chat-summaries", currentUserId],
                    refetchType: "none",
                  });
                  return oldSummaries;
                }

                // Update the specific chat's last message info
                const updated = [...oldSummaries];
                const chatSummary = updated[chatIndex];
                const isP1 = chatSummary.participant_1_id === currentUserId;

                // Update unread count (increment for the current user)
                const newUnreadCountP1 = isP1
                  ? (chatSummary.unread_count_p1 || 0) + 1
                  : chatSummary.unread_count_p1;
                const newUnreadCountP2 = !isP1
                  ? (chatSummary.unread_count_p2 || 0) + 1
                  : chatSummary.unread_count_p2;

                updated[chatIndex] = {
                  ...chatSummary,
                  last_message_at: newMessage.created_at,
                  last_message_content: newMessage.content || null,
                  last_message_has_image: !!(newMessage.image_url && newMessage.image_url.trim() !== ""),
                  unread_count_p1: newUnreadCountP1,
                  unread_count_p2: newUnreadCountP2,
                };

                // CRITICAL: Move updated chat to top and ensure proper sorting by last_message_at
                // This ensures the active chat jumps to the top instantly when new message arrives
                const [movedChat] = updated.splice(chatIndex, 1);
                updated.unshift(movedChat);

                // Additional safety: Re-sort by last_message_at to ensure correct order
                // This handles edge cases where multiple messages arrive simultaneously
                updated.sort((a, b) => {
                  const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                  const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                  return bTime - aTime; // Newest first
                });

                return updated;
              }
            );
          } catch (error) {
            logger.error("Error updating chat cache (INSERT message event)", error, {
              userId: currentUserId,
              component: "ChatScreen",
              event: "chat_messages.INSERT",
              messageId: payload.new?.id,
              chatId: payload.new?.chat_id,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          if (!isMounted) return;

          const updatedMessage = payload.new as any;
          const oldMessage = payload.old as any;

          // Smart update: if read status changed from false to true, update unread counts
          // Only process if message is from other user and transitioning to read
          if (updatedMessage.is_read && !oldMessage?.is_read && updatedMessage.user_id !== currentUserId) {
            queryClient.setQueryData<ChatSummary[]>(
              ["chat-summaries", currentUserId],
              (oldSummaries) => {
                if (!oldSummaries) return oldSummaries;

                const chatIndex = oldSummaries.findIndex(
                  (s) => s.chat_id === updatedMessage.chat_id
                );

                if (chatIndex === -1) return oldSummaries;

                const updated = [...oldSummaries];
                const chatSummary = updated[chatIndex];
                const isP1 = chatSummary.participant_1_id === currentUserId;

                // Get current unread count
                const currentUnreadP1 = chatSummary.unread_count_p1 || 0;
                const currentUnreadP2 = chatSummary.unread_count_p2 || 0;

                // Decrement unread count (respect optimistic updates - if already 0, keep at 0)
                // The database view will recalculate, but this keeps UI responsive
                updated[chatIndex] = {
                  ...chatSummary,
                  unread_count_p1: isP1
                    ? Math.max(0, currentUnreadP1 - 1)
                    : currentUnreadP1,
                  unread_count_p2: !isP1
                    ? Math.max(0, currentUnreadP2 - 1)
                    : currentUnreadP2,
                };

                return updated;
              }
            );

            // Update global unread count optimistically from updated chat-summaries cache
            // CRITICAL: Calculate from cache instead of invalidating to ensure immediate sync
            queryClient.setQueriesData<number>(
              { queryKey: ["global-unread-count", currentUserId], exact: false },
              () => {
                // Get updated chat summaries from cache
                const updatedSummaries = queryClient.getQueryData<ChatSummary[]>(["chat-summaries", currentUserId]);
                if (!updatedSummaries || !Array.isArray(updatedSummaries)) {
                  return undefined; // Let queryFn handle it
                }

                // Get blocks from cache (needed for calculation)
                const cachedBlocks = queryClient.getQueryData<string[]>(["blocks", currentUserId]) || [];

                // Calculate total unread count from cached summaries
                const total = updatedSummaries.reduce((sum: number, chat: ChatSummary) => {
                  const otherUserId =
                    chat.participant_1_id === currentUserId
                      ? chat.participant_2_id
                      : chat.participant_1_id;

                  // Skip chats with blocked users
                  if (cachedBlocks.includes(otherUserId)) {
                    return sum;
                  }

                  const isP1 = chat.participant_1_id === currentUserId;
                  const unread = isP1
                    ? chat.unread_count_p1 || 0
                    : chat.unread_count_p2 || 0;
                  return sum + unread;
                }, 0);

                return total;
              }
            );
          }
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
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          logger.breadcrumb("Chat list subscription active", "realtime", {
            userId: currentUserId,
            channel: "chats-realtime",
          });
        } else if (status === "CHANNEL_ERROR") {
          logger.error("Chat list subscription error", new Error(`Subscription status: ${status}`), {
            userId: currentUserId,
            component: "ChatScreen",
            channel: "chats-realtime",
            status,
          });
        } else if (status === "TIMED_OUT") {
          logger.warn("Chat list subscription timed out", {
            userId: currentUserId,
            component: "ChatScreen",
            channel: "chats-realtime",
          });
        }
      });

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

      // Unsubscribe and remove channel properly
      channel.unsubscribe();
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
          lastMessage={item.last_message_content ?? ""}
          lastMessageHasImage={item.last_message_has_image === true}
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
        removeClippedSubviews={true}
      />
    </View>
  );
}
