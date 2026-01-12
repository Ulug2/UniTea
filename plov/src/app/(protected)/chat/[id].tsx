import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { format, isToday, isYesterday, startOfDay, isSameDay } from "date-fns";
import { Database } from "../../../types/database.types";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import ChatDetailSkeleton from "../../../components/ChatDetailSkeleton";
import SupabaseImage from "../../../components/SupabaseImage";

type Chat = Database['public']['Tables']['chats']['Row'];
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

const MESSAGES_PER_PAGE = 20;

// Simple hash function for deterministic anonymous user numbers
function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash % 9000) + 1000;
}

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  // Fetch chat data
  const { data: chat, isLoading: isLoadingChat } = useQuery<Chat | null>({
    queryKey: ["chat", id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
    staleTime: 1000 * 60 * 10, // Chat stays fresh for 10 minutes
    gcTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 2,
  });

  // Get other user ID
  const otherUserId =
    chat?.participant_1_id === currentUserId
      ? chat?.participant_2_id
      : chat?.participant_1_id;

  const isAnonymous = otherUserId?.startsWith("anonymous-");

  // Fetch other user profile
  const { data: otherUser, isLoading: isLoadingUser } =
    useQuery<Profile | null>({
      queryKey: ["chat-other-user", otherUserId],
      queryFn: async () => {
        if (!otherUserId || isAnonymous) return null;

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", otherUserId)
          .single();

        if (error) throw error;
        return data;
      },
      enabled: Boolean(otherUserId) && !isAnonymous,
      staleTime: 1000 * 60 * 30, // Profile stays fresh for 30 minutes
      gcTime: 1000 * 60 * 60, // Cache for 1 hour
      retry: 2,
    });

  // Fix anonymous name flickering with deterministic generation
  const otherUserName = useMemo(() => {
    if (isAnonymous && otherUserId) {
      return `Anonymous User #${hashStringToNumber(otherUserId)}`;
    }
    return otherUser?.username || "Unknown User";
  }, [isAnonymous, otherUserId, otherUser?.username]);

  const otherUserInitial = useMemo(() => {
    if (isAnonymous) return "?";
    return otherUser?.username?.charAt(0).toUpperCase() || "?";
  }, [isAnonymous, otherUser?.username]);

  // Fetch messages with pagination using useInfiniteQuery
  const {
    data: messagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingMessages,
  } = useInfiniteQuery({
    queryKey: ["chat-messages", id],
    queryFn: async ({ pageParam = 0 }) => {
      if (!id) return [];

      const from = pageParam * MESSAGES_PER_PAGE;
      const to = from + MESSAGES_PER_PAGE - 1;

      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", id)
        .order("created_at", { ascending: false }) // Fetch newest first for pagination
        .range(from, to);

      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) => {
      // If last page has full page of results, there might be more
      if (lastPage.length === MESSAGES_PER_PAGE) {
        return allPages.length;
      }
      return undefined;
    },
    enabled: Boolean(id),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 15,
    initialPageParam: 0,
    retry: 2,
  });

  // Flatten messages (keep newest first for inverted list)
  const messages = useMemo(() => {
    if (!messagesData) return [];
    return messagesData.pages.flat();
  }, [messagesData]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${id}`,
        },
        (payload) => {
          // New message received - add to cache immediately
          queryClient.setQueryData(["chat-messages", id], (oldData: any) => {
            if (!oldData) return oldData;

            // Add new message to first page (most recent)
            const newPages = [...oldData.pages];
            if (newPages[0]) {
              newPages[0] = [payload.new, ...newPages[0]];
            } else {
              newPages[0] = [payload.new];
            }

            return {
              ...oldData,
              pages: newPages,
            };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${id}`,
        },
        () => {
          // Message updated (e.g., read status) - invalidate to refetch
          queryClient.invalidateQueries({ queryKey: ["chat-messages", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  // Mark messages as read when opening chat - optimized
  useEffect(() => {
    if (!id || !currentUserId || messages.length === 0) return;

    const markAsRead = async () => {
      // Check if there are any unread messages from other user
      const hasUnread = messages.some(
        (msg) => !msg.is_read && msg.user_id !== currentUserId
      );

      if (!hasUnread) return;

      // Mark all unread messages as read (single query)
      const { error } = await supabase
        .from("chat_messages")
        .update({ is_read: true })
        .eq("chat_id", id)
        .eq("is_read", false)
        .neq("user_id", currentUserId);

      if (error) {
        console.error("Error marking messages as read:", error);
        return;
      }

      // Optimistically update cache
      queryClient.setQueryData(["chat-messages", id], (oldData: any) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page: ChatMessage[]) =>
          page.map((msg) => {
            if (msg.user_id !== currentUserId && !msg.is_read) {
              return { ...msg, is_read: true };
            }
            return msg;
          })
        );

        return {
          ...oldData,
          pages: newPages,
        };
      });

      // Refresh chat summaries to update unread counts (don't refetch to preserve scroll)
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries"],
        refetchType: "none",
      });
    };

    // Debounce to avoid marking as read too quickly
    const timer = setTimeout(markAsRead, 800);
    return () => clearTimeout(timer);
  }, [id, currentUserId, messages, queryClient]);

  const getMessageTime = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return format(date, "h:mm a");
  };

  const getDateDivider = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  /**
   * Determines if a date divider should be shown between messages
   *
   * Context: Messages are stored newest-first and rendered with inverted FlatList
   * - Data: [msg1(today), msg2(yesterday), msg3(yesterday)]
   * - Visual: msg3 (bottom) → msg2 → msg1 (top)
   *
   * Logic: Show divider when current message is from a different day than next (older) message
   * The divider is rendered AFTER the message in JSX, so with inverted list it appears
   * BELOW the message visually, acting as a separator between date groups
   *
   * Timezone handling: Uses isSameDay from date-fns which compares calendar days
   * in the user's local timezone, ensuring consistent behavior across timezones
   *
   * @param currentMsg - The message being rendered
   * @param nextMsg - The next message in the array (older chronologically)
   * @returns true if a date divider should be shown
   */
  const shouldShowDateDivider = (
    currentMsg: ChatMessage,
    nextMsg: ChatMessage | null
  ) => {
    // Always show divider for the last (oldest) message
    if (!nextMsg || !currentMsg.created_at || !nextMsg.created_at) {
      return true;
    }

    // Use date-fns isSameDay for robust timezone-aware comparison
    // This handles edge cases like DST transitions and server/client timezone differences
    const currentDate = new Date(currentMsg.created_at);
    const nextDate = new Date(nextMsg.created_at);

    return !isSameDay(currentDate, nextDate);
  };

  const handleSend = useCallback(async () => {
    if (!message.trim() || !id || !currentUserId) return;

    const messageText = message.trim();
    const tempId = `temp-${Date.now()}`; // Temporary ID for optimistic update
    const now = new Date().toISOString();

    const optimisticMessage: ChatMessage = {
      id: tempId,
      chat_id: id,
      user_id: currentUserId,
      content: messageText,
      created_at: now,
      is_read: false,
    };

    setMessage(""); // Clear input immediately

    // 1. Optimistic update - add message to chat detail cache immediately
    queryClient.setQueryData(["chat-messages", id], (oldData: any) => {
      if (!oldData) return oldData;

      const newPages = [...oldData.pages];
      if (newPages[0]) {
        newPages[0] = [optimisticMessage, ...newPages[0]];
      } else {
        newPages[0] = [optimisticMessage];
      }

      return {
        ...oldData,
        pages: newPages,
      };
    });

    // 2. Optimistic update - update chat list cache (WhatsApp-style instant update!)
    // Update for empty search query (most common case)
    queryClient.setQueryData<any[]>(
      ["chat-summaries", currentUserId, ""],
      (oldSummaries: any[] | undefined) => {
        if (!oldSummaries) return oldSummaries;

        // Find the chat and move it to top with new message
        let updatedChat: any = null;
        const others = oldSummaries.filter((summary: any) => {
          if (summary.chat_id === id) {
            updatedChat = {
              ...summary,
              last_message_content: messageText,
              last_message_at: now,
            };
            return false; // Remove from current position
          }
          return true;
        });

        // Put updated chat at the top (most recent first)
        return updatedChat ? [updatedChat, ...others] : oldSummaries;
      }
    );

    try {
      // 1. Insert message
      const { data: newMessage, error: messageError } = await supabase
        .from("chat_messages")
        .insert({
          chat_id: id,
          user_id: currentUserId,
          content: messageText,
          is_read: false,
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // 2. Update chat's last_message_at
      const { error: chatError } = await supabase
        .from("chats")
        .update({
          last_message_at: now,
        })
        .eq("id", id);

      if (chatError) throw chatError;

      // 3. Replace optimistic message with real one
      queryClient.setQueryData(["chat-messages", id], (oldData: any) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page: ChatMessage[]) =>
          page.map((msg) => (msg.id === tempId ? newMessage : msg))
        );

        return {
          ...oldData,
          pages: newPages,
        };
      });

      // 4. Mark all chat summaries as stale for eventual server sync (preserves scroll)
      // This ensures data accuracy when user navigates back or refetches
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries"],
        refetchType: "none", // Don't refetch now, wait for focus
      });
    } catch (error) {
      console.error("Error sending message:", error);

      // Rollback optimistic update for messages
      queryClient.setQueryData(["chat-messages", id], (oldData: any) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page: ChatMessage[]) =>
          page.filter((msg) => msg.id !== tempId)
        );

        return {
          ...oldData,
          pages: newPages,
        };
      });

      // Rollback optimistic update for chat summaries - refetch to get correct state
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries", currentUserId],
        refetchType: "active", // Force immediate refetch on error
      });

      Alert.alert("Error", "Failed to send message. Please try again.");
      setMessage(messageText); // Restore message on error
    }
  }, [message, id, currentUserId, queryClient]);

  const renderMessage = ({
    item,
    index,
  }: {
    item: ChatMessage;
    index: number;
  }) => {
    const isCurrentUser = item.user_id === currentUserId;
    // For inverted list: compare with next item (older message)
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
    const showDateDivider = shouldShowDateDivider(item, nextMsg);

    return (
      <>
        {/* Message bubble rendered first in JSX */}
        <View
          style={[
            styles.messageContainer,
            isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              {
                backgroundColor: isCurrentUser ? "#5DBEBC" : theme.card,
                borderRadius: 20,
              },
            ]}
          >
            <Text
              style={[
                styles.messageText,
                {
                  color: isCurrentUser ? "#FFFFFF" : theme.text,
                },
              ]}
            >
              {item.content}
            </Text>
          </View>
          <Text
            style={[
              styles.messageTime,
              { color: theme.secondaryText },
              isCurrentUser && styles.currentUserTime,
            ]}
          >
            {getMessageTime(item.created_at)}
          </Text>
        </View>
        {/* Date divider rendered AFTER message in JSX
            With inverted={true}, this appears BELOW the message visually,
            creating a proper separator between date groups */}
        {showDateDivider && (
          <View style={styles.dateDividerContainer}>
            <View
              style={[styles.dateDivider, { backgroundColor: theme.border }]}
            >
              <Text
                style={[styles.dateDividerText, { color: theme.secondaryText }]}
              >
                {getDateDivider(item.created_at)}
              </Text>
            </View>
          </View>
        )}
      </>
    );
  };

  // Show skeleton loading screen while chat or user data is loading
  // This prevents "Unknown User" flicker and ensures complete data before render
  const isInitialLoading = isLoadingChat || (isLoadingUser && !isAnonymous);

  if (isInitialLoading) {
    return <ChatDetailSkeleton />;
  }

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: insets.top,
    },
    header: {
      flexDirection: "row",
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
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isAnonymous ? "#2C3E50" : "#5DBEBC",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    avatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    avatarText: {
      fontSize: 18,
      color: "#FFFFFF",
      fontFamily: "Poppins_600SemiBold",
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
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Math.max(insets.bottom, 12),
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
  });

  return (
    <View style={dynamicStyles.container}>
      {/* HEADER */}
      <View style={dynamicStyles.header}>
        <Pressable
          onPress={() => router.back()}
          style={dynamicStyles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>

        {!isAnonymous && otherUser?.avatar_url ? (
          otherUser.avatar_url.startsWith("http") ? (
            <Image
              source={{ uri: otherUser.avatar_url }}
              style={dynamicStyles.avatarImage}
            />
          ) : (
            <SupabaseImage
              path={otherUser.avatar_url}
              bucket="avatars"
              style={dynamicStyles.avatarImage}
            />
          )
        ) : (
          <View style={dynamicStyles.avatar}>
            <Text style={dynamicStyles.avatarText}>{otherUserInitial}</Text>
          </View>
        )}

        <Text style={dynamicStyles.userName}>{otherUserName}</Text>

        <Pressable style={dynamicStyles.menuButton}>
          <Ionicons name="ellipsis-vertical" size={24} color={theme.text} />
        </Pressable>
      </View>

      {/* MESSAGES LIST */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={dynamicStyles.messagesList}
          inverted={true}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ padding: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : null
          }
        />

        {/* INPUT */}
        <View style={dynamicStyles.inputContainer}>
          <TextInput
            placeholder="Type a message..."
            placeholderTextColor={theme.secondaryText}
            value={message}
            onChangeText={setMessage}
            style={dynamicStyles.input}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={handleSend}
            style={[
              dynamicStyles.sendButton,
              { opacity: !message.trim() ? 0.5 : 1 },
            ]}
            disabled={!message.trim()}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageText: {
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
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
});
