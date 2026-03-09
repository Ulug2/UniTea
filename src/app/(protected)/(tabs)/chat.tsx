import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
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
import { useBlocks, isBlockedChat } from "../../../hooks/useBlocks";
import { useRevealAfterFirstNImages } from "../../../hooks/useRevealAfterFirstNImages";
import { saveChatToStorage } from "../../../utils/feedPersistence";

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

      // Only hide chats where a profile_only block exists (not anonymous_only)
      const otherUserId =
        chat.participant_1_id === currentUserId
          ? chat.participant_2_id
          : chat.participant_1_id;

      if (isBlockedChat(blocks, otherUserId)) {
        return false;
      }

      // Additional safety check - ensure chat_id exists
      if (!chat.chat_id) {
        return false;
      }

      return true;
    });
  }, [chatSummaries, blocks, currentUserId]);

  // Real-time subscription for chat updates.
  //
  // Two filtered channels on the `chats` table replace the previous single
  // unfiltered channel. Each channel receives only rows where the current user
  // is one of the two participants, so Supabase Realtime never broadcasts
  // irrelevant rows to this client.
  //
  // chat_messages listeners have been removed from this screen entirely:
  //   • The `chats` UPDATE event (fired by the DB trigger that bumps
  //     last_message_at) is sufficient to keep the chat list current.
  //   • Per-message delivery is handled by the detail screen's own filtered
  //     channel (`chat-${chatId}` with `filter: "chat_id=eq.${chatId}"`).
  const channelErrorLoggedRef = useRef(false);
  useEffect(() => {
    if (!currentUserId) return;

    channelErrorLoggedRef.current = false;
    let isMounted = true;

    // Shared handler for all chats-table events on both channels.
    const handleChatEvent = (payload: any) => {
      if (!isMounted) return;

      const { eventType } = payload;

      try {
        if (eventType === "DELETE") {
          const deletedChatId = payload.old?.id;
          if (deletedChatId) {
            queryClient.setQueryData<ChatSummary[]>(
              ["chat-summaries", currentUserId],
              (old) => old ? old.filter((s) => s.chat_id !== deletedChatId) : old,
            );
          }
          queryClient.invalidateQueries({
            queryKey: ["chat-summaries", currentUserId],
            refetchType: "none",
          });
          queryClient.invalidateQueries({
            queryKey: ["global-unread-count", currentUserId],
            refetchType: "none",
          });
          return;
        }

        if (eventType === "INSERT") {
          // New chat — rare event; invalidate so the list re-fetches on next access.
          queryClient.invalidateQueries({
            queryKey: ["chat-summaries", currentUserId],
            refetchType: "none",
          });
          return;
        }

        if (eventType === "UPDATE") {
          const updatedChat = payload.new as any;
          queryClient.setQueryData<ChatSummary[]>(
            ["chat-summaries", currentUserId],
            (oldSummaries) => {
              if (!oldSummaries) return oldSummaries;

              const chatIndex = oldSummaries.findIndex(
                (s) => s.chat_id === updatedChat.id,
              );

              if (chatIndex === -1) {
                queryClient.invalidateQueries({
                  queryKey: ["chat-summaries", currentUserId],
                  refetchType: "none",
                });
                return oldSummaries;
              }

              const updated = [...oldSummaries];
              updated[chatIndex] = {
                ...updated[chatIndex],
                last_message_at:
                  updatedChat.last_message_at ||
                  updated[chatIndex].last_message_at,
                last_message_content:
                  updatedChat.last_message_content ??
                  updated[chatIndex].last_message_content,
                unread_count_p1:
                  updatedChat.unread_count_p1 ??
                  updated[chatIndex].unread_count_p1,
                unread_count_p2:
                  updatedChat.unread_count_p2 ??
                  updated[chatIndex].unread_count_p2,
              };

              updated.sort((a, b) => {
                const aTime = a.last_message_at
                  ? new Date(a.last_message_at).getTime()
                  : 0;
                const bTime = b.last_message_at
                  ? new Date(b.last_message_at).getTime()
                  : 0;
                return bTime - aTime;
              });

              return updated;
            },
          );

          // Keep the global badge in sync by re-deriving from the updated cache.
          const updatedSummaries = queryClient.getQueryData<ChatSummary[]>([
            "chat-summaries",
            currentUserId,
          ]);
          if (updatedSummaries) {
            const cachedBlocks =
              queryClient.getQueryData<string[]>(["blocks", currentUserId]) ||
              [];
            const total = updatedSummaries.reduce(
              (sum: number, chat: ChatSummary) => {
                const otherId =
                  chat.participant_1_id === currentUserId
                    ? chat.participant_2_id
                    : chat.participant_1_id;
                if (cachedBlocks.includes(otherId)) return sum;
                const isP1 = chat.participant_1_id === currentUserId;
                return (
                  sum +
                  (isP1
                    ? chat.unread_count_p1 || 0
                    : chat.unread_count_p2 || 0)
                );
              },
              0,
            );
            queryClient.setQueriesData<number>(
              { queryKey: ["global-unread-count", currentUserId], exact: false },
              total,
            );
          }
        }
      } catch (error) {
        logger.error("Error handling chat realtime event", error, {
          userId: currentUserId,
          component: "ChatScreen",
          eventType,
        });
      }
    };

    const onStatus = (channelName: string) => (status: string) => {
      if (status === "SUBSCRIBED") {
        logger.breadcrumb("Chat list subscription active", "realtime", {
          userId: currentUserId,
          channel: channelName,
        });
      } else if (status === "CHANNEL_ERROR" && !channelErrorLoggedRef.current) {
        channelErrorLoggedRef.current = true;
        logger.warn(
          "Chat list realtime subscription failed. Check RLS SELECT policies on `chats`.",
          { userId: currentUserId, component: "ChatScreen", channel: channelName, status },
        );
      } else if (status === "TIMED_OUT") {
        logger.warn("Chat list subscription timed out", {
          userId: currentUserId,
          component: "ChatScreen",
          channel: channelName,
        });
      }
    };

    // Channel A — chats where the current user is participant_1
    const channelP1 = supabase
      .channel(`chats-p1-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chats",
          filter: `participant_1_id=eq.${currentUserId}`,
        },
        handleChatEvent,
      )
      .subscribe(onStatus(`chats-p1-${currentUserId}`));

    // Channel B — chats where the current user is participant_2
    const channelP2 = supabase
      .channel(`chats-p2-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chats",
          filter: `participant_2_id=eq.${currentUserId}`,
        },
        handleChatEvent,
      )
      .subscribe(onStatus(`chats-p2-${currentUserId}`));

    return () => {
      isMounted = false;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      if (updateDebounceRef.current) {
        clearTimeout(updateDebounceRef.current);
        updateDebounceRef.current = undefined;
      }

      channelP1.unsubscribe();
      supabase.removeChannel(channelP1);
      channelP2.unsubscribe();
      supabase.removeChannel(channelP2);
      channelErrorLoggedRef.current = false;
    };
  }, [currentUserId, queryClient]);

  // Get all unique participant IDs (excluding anonymous), SORTED so the React
  // Query key ["chat-users", participantIds] is order-stable. Without sorting,
  // the freshly-computed array may differ in order from what was stored in
  // AsyncStorage, causing a cache miss and the "Unknown User" flicker.
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    (chatSummaries as ChatSummary[]).forEach((chat: ChatSummary) => {
      ids.add(chat.participant_1_id);
      ids.add(chat.participant_2_id);
    });
    return Array.from(ids)
      .filter((id: string) => !id.startsWith("anonymous-"))
      .sort();
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

  // Persist chat list to AsyncStorage so cold-start shows data instantly.
  // Wait until users are loaded too so avatars/names are cached alongside summaries.
  useEffect(() => {
    if (!currentUserId || !chatSummaries.length) return;
    saveChatToStorage(
      currentUserId,
      chatSummaries as Record<string, unknown>[],
      users as Record<string, unknown>[],
      participantIds,
    );
  }, [chatSummaries, users, participantIds, currentUserId]);

  const { shouldReveal, onItemReady } = useRevealAfterFirstNImages({
    minItems: 3,
    timeoutMs: 2500,
    initialRevealed: chatSummaries.length > 0,
  });

  // Render function for FlatList - must be defined at component level (Rules of Hooks)
  const renderChatItem = useCallback(
    ({ item, index }: { item: ChatSummary; index: number }) => {
      const { user, isAnonymous } = getOtherUser(item);
      const otherUserId =
        item.participant_1_id === currentUserId
          ? item.participant_2_id
          : item.participant_1_id;

      return (
        <ChatListItem
          chatId={item.chat_id}
          lastMessageAt={item.last_message_at}
          otherUser={user}
          lastMessage={item.last_message_content ?? ""}
          lastMessageHasImage={item.last_message_has_image === true}
          unreadCount={getUnreadCount(item)}
          isAnonymous={isAnonymous}
          onImageLoad={index < 5 ? onItemReady : undefined}
          onBeforeNavigate={() => {
            // Pre-seed the detail screen queries synchronously so that
            // ChatDetailSkeleton never flashes when navigating from this list.
            const syntheticChat = {
              id: item.chat_id,
              participant_1_id: item.participant_1_id,
              participant_2_id: item.participant_2_id,
              post_id: item.post_id,
              created_at: item.created_at,
              last_message_at: item.last_message_at,
            };
            queryClient.setQueryData(
              ["chat", item.chat_id],
              syntheticChat,
              { updatedAt: 0 },
            );
            if (user && !isAnonymous) {
              queryClient.setQueryData(
                ["chat-other-user", otherUserId],
                user,
                { updatedAt: 0 },
              );
            }
          }}
        />
      );
    },
    [getOtherUser, getUnreadCount, onItemReady, queryClient, currentUserId]
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

  // Show skeleton only when we have no chat summaries at all (true cold start with no cache).
  // User profiles load in the background; ChatListItem handles null user gracefully.
  if (isLoadingChats) {
    return (
      <View style={styles.container}>
        <ChatListSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={{
          flex: 1,
          opacity: shouldReveal ? 1 : 0,
          pointerEvents: shouldReveal ? "auto" : "none",
        }}
      >
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
      {!shouldReveal && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.background },
          ]}
          pointerEvents="none"
        >
          <ChatListSkeleton />
        </View>
      )}
    </View>
  );
}
