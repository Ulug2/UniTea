import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
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
  Keyboard,
  ActionSheetIOS,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  AppState,
  AppStateStatus,
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
  useMutation,
} from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import ChatDetailSkeleton from "../../../components/ChatDetailSkeleton";
import SupabaseImage from "../../../components/SupabaseImage";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { uploadImage } from "../../../utils/supabaseImages";
import { logger } from "../../../utils/logger";
import UserProfileModal from "../../../components/UserProfileModal";
import { DEFAULT_AVATAR } from "../../../constants/images";
import { useBlocks } from "../../../hooks/useBlocks";

type Chat = Database['public']['Tables']['chats']['Row'];
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'] & {
  image_url?: string | null;
  // Local-only fields used for optimistic UI and retries
  sendStatus?: "sending" | "failed";
  _clientPayload?: {
    messageText: string;
    imageUrl?: string | null;
    localImageUri?: string | null;
  } | null;
};
type Profile = Database['public']['Tables']['profiles']['Row'];

// Type for React Query infinite query pages
type MessagesQueryData = {
  pages: ChatMessage[][];
  pageParams: number[];
};

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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [fullScreenImagePath, setFullScreenImagePath] = useState<string | null>(null);
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  // Track pending message IDs to prevent duplicate processing from real-time
  const pendingMessageIds = useRef<Set<string>>(new Set());
  // Track local image URIs for optimistic messages (tempId -> localUri)
  const optimisticImageUris = useRef<Map<string, string>>(new Map());

  // Rate limiting: Track message send times to prevent spam
  const messageSendTimes = useRef<number[]>([]);
  const RATE_LIMIT_MESSAGES = 10; // Max messages
  const RATE_LIMIT_WINDOW_MS = 60000; // Per 60 seconds (1 minute)

  // Cleanup optimistic image URIs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      optimisticImageUris.current.clear();
      pendingMessageIds.current.clear();
    };
  }, []);

  // Track scroll position to know if user is at bottom of the chat
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  // Track how many new messages arrived while user was scrolled up
  const [pendingNewMessages, setPendingNewMessages] = useState(0);

  // Track if send is in progress to prevent double-tap and disable button
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);

  // Ref to the messages FlatList to allow imperative scrolling
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);

  // Full-screen image pinch-to-zoom: animated values and base values for cumulative gestures
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(1);
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);
  const initialPinchDistance = useRef(0);
  const initialPinchCenter = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (fullScreenImagePath) {
      scaleAnim.setValue(1);
      translateXAnim.setValue(0);
      translateYAnim.setValue(0);
      baseScale.current = 1;
      baseTranslateX.current = 0;
      baseTranslateY.current = 0;
      lastScale.current = 1;
      lastTranslateX.current = 0;
      lastTranslateY.current = 0;
    }
  }, [fullScreenImagePath, scaleAnim, translateXAnim, translateYAnim]);

  const fullScreenPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_: any, gestureState: any) => gestureState.numberActiveTouches === 2,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          baseScale.current = lastScale.current;
          baseTranslateX.current = lastTranslateX.current;
          baseTranslateY.current = lastTranslateY.current;
          const a = touches[0];
          const b = touches[1];
          initialPinchDistance.current =
            Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
          initialPinchCenter.current = {
            x: (a.pageX + b.pageX) / 2,
            y: (a.pageY + b.pageY) / 2,
          };
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== 2) return;
        const a = touches[0];
        const b = touches[1];
        const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
        const centerX = (a.pageX + b.pageX) / 2;
        const centerY = (a.pageY + b.pageY) / 2;
        const scale = (baseScale.current * dist) / initialPinchDistance.current;
        const clampedScale = Math.max(0.5, Math.min(scale, 5));
        const tx = baseTranslateX.current + (centerX - initialPinchCenter.current.x);
        const ty = baseTranslateY.current + (centerY - initialPinchCenter.current.y);
        scaleAnim.setValue(clampedScale);
        translateXAnim.setValue(tx);
        translateYAnim.setValue(ty);
        lastScale.current = clampedScale;
        lastTranslateX.current = tx;
        lastTranslateY.current = ty;
      },
      onPanResponderRelease: () => {
        baseScale.current = lastScale.current;
        baseTranslateX.current = lastTranslateX.current;
        baseTranslateY.current = lastTranslateY.current;
      },
    })
  ).current;

  // Track keyboard visibility - use "Will" events on iOS for instant effect
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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

  // Fetch blocked users
  const { data: blocks = [] } = useBlocks();

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

      if (error) {
        logger.error("Failed to fetch chat messages", error, {
          userId: currentUserId,
          chatId: id,
          component: "ChatDetailScreen",
          queryKey: "chat-messages",
        });
        throw error;
      }
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
    staleTime: 1000 * 60 * 2, // Messages stay fresh for 2 minutes - rely on real-time updates
    gcTime: 1000 * 60 * 15,
    initialPageParam: 0,
    retry: (failureCount, error) => {
      // Log error on retry
      if (failureCount > 0) {
        logger.warn("Retrying chat messages query", {
          userId: currentUserId,
          chatId: id,
          component: "ChatDetailScreen",
          failureCount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return failureCount < 2; // Retry up to 2 times
    },
  });

  // Flatten messages and filter out blocked users' messages
  const messages = useMemo(() => {
    if (!messagesData) return [];
    const allMessages = messagesData.pages.flat();

    // Filter out messages from blocked users
    if (blocks.length > 0) {
      return allMessages.filter((msg) => !blocks.includes(msg.user_id));
    }

    return allMessages;
  }, [messagesData, blocks]);

  type DeleteAction = "delete_for_me" | "delete_for_everyone";

  const deleteMessageMutation = useMutation({
    mutationFn: async ({
      messageId,
      action,
      isSender,
    }: {
      messageId: string;
      action: DeleteAction;
      isSender: boolean;
    }) => {
      if (!currentUserId) {
        throw new Error("User not authenticated");
      }

      let update: Partial<ChatMessage> = {};

      if (action === "delete_for_me") {
        if (isSender) {
          update = { deleted_by_sender: true as any };
        } else {
          update = { deleted_by_receiver: true as any };
        }
      } else if (action === "delete_for_everyone") {
        if (!isSender) {
          throw new Error("Only the sender can delete a message for everyone");
        }
        // Mark as deleted for both sides instead of using non‑existent is_deleted
        update = {
          deleted_by_sender: true as any,
          deleted_by_receiver: true as any,
        };
      }

      const { error } = await supabase
        .from("chat_messages")
        .update(update)
        .eq("id", messageId);

      if (error) {
        throw error;
      }
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["chat-messages", id] });

      const previousData = queryClient.getQueryData<any>([
        "chat-messages",
        id,
      ]);

      queryClient.setQueryData(["chat-messages", id], (oldData: any) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page: ChatMessage[]) => {
          if (!Array.isArray(page)) return page;

          if (variables.action === "delete_for_me") {
            // Remove the message for this user only
            return page.filter((msg) => msg.id !== variables.messageId);
          }

          if (variables.action === "delete_for_everyone") {
            // Mark the message as deleted for everyone
            return page.map((msg) =>
              msg.id === variables.messageId
                ? {
                  ...msg,
                  is_deleted: true as any,
                  content: "This message was deleted",
                }
                : msg
            );
          }

          return page;
        });

        return {
          ...oldData,
          pages: newPages,
        };
      });

      return { previousData };
    },
    onError: (error, variables, context) => {
      logger.error("Error deleting message", error, {
        userId: currentUserId,
        chatId: id,
        component: "ChatDetailScreen",
        operation: "deleteMessage",
        messageId: variables?.messageId,
        action: variables?.action,
      });

      if (context?.previousData) {
        queryClient.setQueryData(["chat-messages", id], context.previousData);
      }
      Alert.alert("Error", "Failed to delete message. Please try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", id] });
    },
  });

  // Real-time subscription: subscribe on mount, unsubscribe on unmount (navigate away).
  // Uses smart cache updates to instantly show new messages without refetching
  useEffect(() => {
    if (!id || !currentUserId) return;

    let isMounted = true;
    let subscriptionStatus: "SUBSCRIBED" | "SUBSCRIBING" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" = "SUBSCRIBING";

    // CRITICAL: Use unique, consistent channel name for this chat
    // Format: chat-{chatId} ensures proper cleanup and prevents conflicts
    // Supabase will handle cleanup when component unmounts
    const channelName = `chat-${id}`;
    const channel = supabase.channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${id}`,
        },
        (payload) => {
          if (!isMounted) return;

          try {
            const newMessage = payload.new as ChatMessage;

            // Skip our own messages - they're handled by optimistic updates
            if (newMessage.user_id === currentUserId) {
              return;
            }

            // Check if chat_id matches (safety check)
            if (newMessage.chat_id !== id) {
              return;
            }

            // Prevent duplicates: check if message already exists or is pending
            if (pendingMessageIds.current.has(newMessage.id)) {
              return;
            }

            // Mark as pending
            pendingMessageIds.current.add(newMessage.id);

            // Remove from pending after a delay (cleanup)
            setTimeout(() => {
              pendingMessageIds.current.delete(newMessage.id);
            }, 5000);

            // New message received - add to cache immediately with proper infinite query structure
            // CRITICAL: Create completely new object references to ensure React Query detects the change
            queryClient.setQueryData<MessagesQueryData>(["chat-messages", id], (oldData) => {
              if (!oldData) {
                // If no data exists, create initial structure
                logger.breadcrumb("Creating initial messages cache with new message", "cache", {
                  chatId: id,
                  messageId: newMessage.id,
                });
                return {
                  pages: [[newMessage]],
                  pageParams: [0],
                };
              }

              const safePages = Array.isArray(oldData.pages) ? oldData.pages : [];

              // Check if message already exists (prevent duplicates)
              const allMessages = safePages.flat();
              const existingMessage = allMessages.find((m: ChatMessage) => m.id === newMessage.id);
              if (existingMessage) {
                logger.breadcrumb("Message already in cache, skipping", "cache", {
                  chatId: id,
                  messageId: newMessage.id,
                });
                return oldData; // Message already in cache
              }

              logger.breadcrumb("Adding new message to cache", "cache", {
                chatId: id,
                messageId: newMessage.id,
                currentPageCount: safePages.length,
                firstPageLength: safePages[0]?.length || 0,
              });

              // CRITICAL: Create completely new array references for ALL pages
              // Even unchanged pages get new array references to ensure React Query detects change
              const newPages = (safePages.length ? safePages : [[]]).map((page, index) => {
                if (index === 0 && Array.isArray(page)) {
                  // Prepend to first page (newest first) - create new array
                  return [newMessage, ...page];
                }
                // Return new array reference even if unchanged (ensures detection)
                return Array.isArray(page) ? [...page] : [];
              });

              // If first page doesn't exist, create it
              if (!newPages[0] || !Array.isArray(newPages[0])) {
                newPages[0] = [newMessage];
              }

              const newPageParams = Array.isArray(oldData.pageParams)
                ? [...oldData.pageParams]
                : [0];

              const newData: MessagesQueryData = {
                pages: newPages,
                pageParams: newPageParams,
              };

              logger.breadcrumb("Cache updated successfully", "cache", {
                chatId: id,
                messageId: newMessage.id,
                newPageCount: newData.pages.length,
                newFirstPageLength: newData.pages[0]?.length || 0,
              });

              return newData;
            });

            // Auto-scroll only if user is currently at bottom; otherwise, respect their scroll
            if (isAtBottomRef.current && flatListRef.current) {
              // Small delay to ensure cache update is rendered first
              setTimeout(() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              }, 100);
            } else {
              // User is reading older messages - show "new messages" indicator instead
              setPendingNewMessages((count) => count + 1);
            }

            // Update global unread count
            queryClient.invalidateQueries({
              queryKey: ["global-unread-count", currentUserId],
              refetchType: "none", // Don't refetch immediately
            });
          } catch (error) {
            logger.error("Error updating messages cache (INSERT event)", error, {
              userId: currentUserId,
              chatId: id,
              component: "ChatDetailScreen",
              event: "chat_messages.INSERT",
              messageId: payload.new?.id,
            });
          }
        }
      )
      .subscribe((status) => {
        subscriptionStatus = status;

        if (status === "SUBSCRIBED" && isMounted) {
          logger.breadcrumb("Chat detail subscription active", "realtime", {
            userId: currentUserId,
            chatId: id,
            channel: `chat-${id}`,
          });
        } else if (status === "CHANNEL_ERROR" && isMounted) {
          logger.error(
            "Chat detail subscription error",
            new Error(`Subscription status: ${status}`),
            {
              userId: currentUserId,
              chatId: id,
              component: "ChatDetailScreen",
              channel: `chat-${id}`,
              status,
            }
          );
          // On error, invalidate to refetch (fallback)
          setTimeout(() => {
            if (isMounted) {
              queryClient.invalidateQueries({
                queryKey: ["chat-messages", id],
                refetchType: "active",
              });
            }
          }, 1000);
        } else if (status === "TIMED_OUT" && isMounted) {
          logger.warn("Chat detail subscription timed out", {
            userId: currentUserId,
            chatId: id,
            component: "ChatDetailScreen",
            channel: `chat-${id}`,
          });
          // Resubscribe on timeout
          setTimeout(() => {
            if (isMounted) {
              channel.unsubscribe();
              supabase.removeChannel(channel);
              // Trigger re-subscription by invalidating (component will re-run effect)
              queryClient.invalidateQueries({
                queryKey: ["chat-messages", id],
                refetchType: "none",
              });
            }
          }, 2000);
        }
      });

    // Connection Recovery: Listen for app state changes to catch up on missed messages
    // When app comes back from background, the socket might have been disconnected
    // and we may have missed some messages
    const appStateSubscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isMounted && id && currentUserId) {
        // App came to foreground - check for missed messages
        // Small delay to allow socket to reconnect first
        setTimeout(() => {
          if (isMounted) {
            // Force refetch to catch up on any missed messages while socket was disconnected
            queryClient.invalidateQueries({
              queryKey: ["chat-messages", id],
              refetchType: "active", // Refetch if query is active (user is viewing chat)
            });
            logger.breadcrumb("App state changed to active - checking for missed messages", "app_state", {
              chatId: id,
              userId: currentUserId,
            });
          }
        }, 1000);
      }
    });

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      if (subscriptionStatus !== "CLOSED") {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      }
    };
  }, [id, currentUserId, queryClient]);

  // Mark messages as read when opening chat - optimized with immediate optimistic updates
  useEffect(() => {
    if (!id || !currentUserId || messages.length === 0) return;

    const markAsRead = async () => {
      // Check if there are any unread messages from other user
      const hasUnread = messages.some(
        (msg) => !msg.is_read && msg.user_id !== currentUserId
      );

      if (!hasUnread) return;

      // 1. Optimistically update chat-summaries cache immediately (set unread_count to 0)
      queryClient.setQueryData<any[]>(["chat-summaries", currentUserId], (oldSummaries: any[] | undefined) => {
        if (!oldSummaries) return oldSummaries;

        return oldSummaries.map((summary: any) => {
          if (summary.chat_id === id) {
            // Update unread count based on which participant is current user
            const isP1 = summary.participant_1_id === currentUserId;
            return {
              ...summary,
              unread_count_p1: isP1 ? 0 : summary.unread_count_p1,
              unread_count_p2: !isP1 ? 0 : summary.unread_count_p2,
            };
          }
          return summary;
        });
      });

      // 2. Optimistically update global unread count (immediate, no delay)
      // Note: Query key may include blocks, so we invalidate all variants to ensure update
      queryClient.setQueriesData<number>(
        { queryKey: ["global-unread-count", currentUserId], exact: false },
        (oldCount: number | undefined) => {
          if (oldCount === undefined) return oldCount;

          // Count unread messages in this chat before marking as read
          const unreadInThisChat = messages.filter(
            (msg) => !msg.is_read && msg.user_id !== currentUserId
          ).length;

          return Math.max(0, oldCount - unreadInThisChat);
        }
      );

      // 3. Optimistically update messages cache
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

      // 4. Send server request (fire and forget - UI already updated)
      supabase
        .from("chat_messages")
        .update({ is_read: true })
        .eq("chat_id", id)
        .eq("is_read", false)
        .neq("user_id", currentUserId)
        .then(({ error }) => {
          if (error) {
            logger.error("Error marking messages as read", error, {
              userId: currentUserId,
              chatId: id,
              component: "ChatDetailScreen",
              operation: "markAsRead",
            });
            // On error, invalidate to refetch correct state
            queryClient.invalidateQueries({ queryKey: ["chat-summaries", currentUserId] });
            queryClient.invalidateQueries({ queryKey: ["global-unread-count", currentUserId] });
          }
        });

      // 5. Update global unread count optimistically from updated chat-summaries cache
      // CRITICAL: Calculate from cache instead of invalidating to ensure immediate sync
      // The queryFn in _layout.tsx will now use cached chat-summaries, so we just need to trigger recalculation
      queryClient.setQueriesData<number>(
        { queryKey: ["global-unread-count", currentUserId], exact: false },
        () => {
          // Get updated chat summaries from cache
          const updatedSummaries = queryClient.getQueryData<any[]>(["chat-summaries", currentUserId]);
          if (!updatedSummaries || !Array.isArray(updatedSummaries)) {
            return undefined; // Let queryFn handle it
          }

          // Get blocks from cache (needed for calculation)
          const cachedBlocks = queryClient.getQueryData<string[]>(["blocks", currentUserId]) || [];

          // Calculate total unread count from cached summaries
          const total = updatedSummaries.reduce((sum: number, chat: any) => {
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
    };

    // Debounce to avoid marking as read too quickly
    const timer = setTimeout(markAsRead, 800);
    return () => clearTimeout(timer);
  }, [id, currentUserId, messages, queryClient]);

  // Track if we've done initial scroll for this chat ID
  const hasScrolledInitiallyRef = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom when messages are first loaded for a chat
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current && hasScrolledInitiallyRef.current !== id) {
      // Clear any pending scroll
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Small delay to ensure FlatList has rendered
      scrollTimeoutRef.current = setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToOffset({ offset: 0, animated: false });
          // Set initial state to "at bottom" since we just scrolled there
          setIsAtBottom(true);
          isAtBottomRef.current = true;
          hasScrolledInitiallyRef.current = id;
        }
        scrollTimeoutRef.current = null;
      }, 200);

      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = null;
        }
      };
    }
  }, [messages.length, id]); // Run when messages load or chat ID changes

  // Refetch messages when screen comes into focus to catch any missed messages
  // This ensures users see new messages even if they navigated away and realtime missed some events
  useFocusEffect(
    useCallback(() => {
      if (!id) return;

      // Reset initial scroll flag when navigating to a different chat
      if (hasScrolledInitiallyRef.current !== id) {
        hasScrolledInitiallyRef.current = null;
      }

      let scrollTimer: NodeJS.Timeout | null = null;

      // Small delay to allow navigation to complete
      const timer = setTimeout(() => {
        // Invalidate to trigger refetch if data is stale or if query is active
        queryClient.invalidateQueries({
          queryKey: ["chat-messages", id],
          refetchType: "active", // Only refetch if query is active (screen is visible)
        });

        // Always scroll to bottom when screen comes into focus (user expects to see latest messages)
        // Use a longer delay to ensure messages have loaded/rendered
        scrollTimer = setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToOffset({ offset: 0, animated: true });
            setIsAtBottom(true);
            isAtBottomRef.current = true;
            hasScrolledInitiallyRef.current = id;
          }
        }, 400); // Longer delay to ensure refetch completes and renders
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scrollTimer) {
          clearTimeout(scrollTimer);
        }
      };
    }, [id, queryClient])
  );

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

  // Send message mutation - uses React Query for proper queuing
  const sendMessageMutation = useMutation<
    { newMessage: ChatMessage; now: string },
    Error,
    { messageText: string; imageUrl?: string | null; localImageUri?: string | null },
    { previousMessages: MessagesQueryData | undefined; previousSummaries: any[] | undefined; tempId: string; optimisticMessage: ChatMessage } | undefined
  >({
    mutationFn: async ({ messageText, imageUrl }) => {
      if (!id || !currentUserId) {
        throw new Error("Missing chat ID or user ID");
      }

      // Server-side rate limiting check (if function exists)
      // This provides an additional layer of protection
      // Note: Function may not exist in types, so we use type assertion
      try {
        const { data: rateLimitCheck, error: rateLimitError } = await (supabase as any)
          .rpc("check_message_rate_limit", {
            p_user_id: currentUserId,
            p_chat_id: id,
            p_max_messages: 10,
            p_time_window_minutes: 1,
          });

        // If rate limit function exists and returns false, user is over limit
        if (!rateLimitError && rateLimitCheck === false) {
          throw new Error("RATE_LIMIT_EXCEEDED: You're sending messages too quickly. Please wait a moment.");
        }
      } catch (rpcError: any) {
        // If RPC function doesn't exist, ignore (client-side rate limiting will handle it)
        // Only throw if it's actually a rate limit error
        if (rpcError?.message?.includes("RATE_LIMIT_EXCEEDED")) {
          throw rpcError;
        }
        // Otherwise, continue with message send (RPC function may not be deployed yet)
      }

      const now = new Date().toISOString();

      // Only include image_url when present so text-only messages work if migration not run yet
      const insertPayload: Database['public']['Tables']['chat_messages']['Insert'] = {
        chat_id: id,
        user_id: currentUserId,
        content: messageText || "",
        is_read: false,
      };
      if (imageUrl != null && imageUrl !== "") {
        insertPayload.image_url = imageUrl;
      }

      const { data: newMessage, error: messageError } = await supabase
        .from("chat_messages")
        .insert(insertPayload)
        .select()
        .single();

      if (messageError) {
        // Check if it's a rate limit error from database
        if (messageError.message?.includes("rate limit") || messageError.message?.includes("too many")) {
          throw new Error("RATE_LIMIT_EXCEEDED: You're sending messages too quickly. Please wait a moment.");
        }
        throw messageError;
      }

      // Update chat's last_message_at (non-blocking, fire and forget)
      supabase
        .from("chats")
        .update({ last_message_at: now })
        .eq("id", id)
        .then(() => {
          // Silently update chat summaries after successful send
          queryClient.invalidateQueries({
            queryKey: ["chat-summaries", currentUserId],
            refetchType: "none",
          });
        });

      return { newMessage, now };
    },
    onMutate: async ({ messageText, imageUrl, localImageUri }: { messageText: string; imageUrl?: string | null; localImageUri?: string | null }) => {
      if (!id || !currentUserId) {
        throw new Error("Missing chat ID or user ID");
      }

      // DON'T await - cancel queries in background, don't block UI
      queryClient.cancelQueries({ queryKey: ["chat-messages", id] });
      queryClient.cancelQueries({ queryKey: ["chat-summaries", currentUserId] });

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const now = new Date().toISOString();

      // Store local image URI for optimistic display if available
      if (localImageUri && imageUrl) {
        optimisticImageUris.current.set(tempId, localImageUri);
      }

      const optimisticMessage: ChatMessage = {
        id: tempId,
        chat_id: id,
        user_id: currentUserId,
        content: messageText || "",
        image_url: imageUrl || null,
        created_at: now,
        is_read: false,
        deleted_by_receiver: null,
        deleted_by_sender: null,
        sendStatus: "sending",
        _clientPayload: {
          messageText,
          imageUrl: imageUrl || null,
          localImageUri: localImageUri || null,
        },
      };

      // Mark as pending to prevent real-time subscription from adding it
      pendingMessageIds.current.add(tempId);

      // Snapshot previous values for rollback
      const previousMessages = queryClient.getQueryData<MessagesQueryData>(["chat-messages", id]);
      const previousSummaries = queryClient.getQueryData<any[]>(["chat-summaries", currentUserId]);

      // IMMEDIATE optimistic update - messages (no waiting)
      queryClient.setQueryData<MessagesQueryData>(["chat-messages", id], (oldData) => {
        if (!oldData) {
          // Create initial structure if no data exists
          return {
            pages: [[optimisticMessage]],
            pageParams: [0],
          };
        }

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

      // Always scroll to bottom when sending our own message (UX: user wants to see what they sent)
      // Small delay to ensure cache update is rendered first
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToOffset({ offset: 0, animated: true });
        }
      }, 100);

      // IMMEDIATE optimistic update - chat summaries (no waiting)
      queryClient.setQueryData<any[]>(["chat-summaries", currentUserId], (oldSummaries: any[] | undefined) => {
        if (!oldSummaries) return oldSummaries;

        let updatedChat: any = null;
        const others = oldSummaries.filter((summary: any) => {
          if (summary.chat_id === id) {
            updatedChat = {
              ...summary,
              last_message_content: messageText,
              last_message_at: now,
              last_message_has_image: !!(imageUrl && imageUrl.trim() !== ""),
            };
            return false;
          }
          return true;
        });

        return updatedChat ? [updatedChat, ...others] : oldSummaries;
      });

      // IMMEDIATE optimistic update - global unread count (don't change for our own messages)
      queryClient.setQueryData<number>(["global-unread-count", currentUserId], (oldCount: number | undefined) => {
        // Don't change unread count for our own messages
        return oldCount;
      });

      return { previousMessages, previousSummaries, tempId, optimisticMessage };
    },
    onSuccess: (data, messageText, context) => {
      if (!context || !id) return;

      const { newMessage } = data;
      const { tempId } = context;

      // Remove temp ID from pending
      pendingMessageIds.current.delete(tempId);
      // Remove local image URI mapping (no longer needed)
      optimisticImageUris.current.delete(tempId);
      // Add real ID to pending (so real-time doesn't duplicate)
      pendingMessageIds.current.add(newMessage.id);

      // Cleanup pending after 5 seconds
      setTimeout(() => {
        pendingMessageIds.current.delete(newMessage.id);
      }, 5000);

      // Replace optimistic message with real one (silent update, no invalidation needed)
      queryClient.setQueryData<MessagesQueryData>(["chat-messages", id], (oldData) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page) =>
          page.map((msg) =>
            msg.id === tempId
              ? {
                ...newMessage,
                // Clear local-only fields; this message is now confirmed
                sendStatus: undefined,
                _clientPayload: null,
              }
              : msg
          )
        );

        return {
          ...oldData,
          pages: newPages,
        };
      });

      // Don't invalidate - we already updated optimistically, no need to refetch
    },
    onError: (error: any, variables, context) => {
      // Remove the send attempt from rate limit tracking on error
      if (messageSendTimes.current.length > 0) {
        messageSendTimes.current.pop();
      }

      logger.error("Error sending message", error, {
        userId: currentUserId,
        chatId: id,
        component: "ChatDetailScreen",
        operation: "sendMessage",
        hasImage: !!variables?.imageUrl,
        messageLength: variables?.messageText?.length || 0,
        errorCode: error?.code,
      });

      if (!context) return;

      // Classify network / transient vs validation / server errors
      const isNetworkError =
        error?.message?.includes("network") ||
        error?.message?.includes("timeout") ||
        error?.message?.includes("fetch") ||
        error?.code === "ECONNABORTED" ||
        error?.code === "ETIMEDOUT";

      // CRITICAL: Always remove tempId from pendingMessageIds so future retries / realtime
      // can proceed without being blocked by a stale pending entry
      if (context.tempId) {
        pendingMessageIds.current.delete(context.tempId);
        optimisticImageUris.current.delete(context.tempId);
      }

      // Network / transient error case:
      // - Keep the optimistic message in UI
      // - Mark it as failed so user can retry
      if (isNetworkError && context.tempId) {
        queryClient.setQueryData<MessagesQueryData>(["chat-messages", id], (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) =>
              page.map((msg) =>
                msg.id === context.tempId
                  ? {
                    ...msg,
                    sendStatus: "failed",
                  }
                  : msg
              )
            ),
          };
        });

        logger.warn("Network error during send - message may have been sent or may be retried", {
          tempId: context.tempId,
          chatId: id,
          userId: currentUserId,
        });

        Alert.alert(
          "Connection issue",
          "We couldn't confirm if your message was delivered. It is marked as failed — tap it to retry.",
          [{ text: "OK" }]
        );
        return;
      }

      // Non-network errors: rollback optimistic updates
      if (context.previousMessages) {
        queryClient.setQueryData(["chat-messages", id], context.previousMessages);
      }
      if (context.previousSummaries) {
        queryClient.setQueryData(["chat-summaries", currentUserId], context.previousSummaries);
      }

      // Handle rate limit errors specially
      const isRateLimit =
        error?.message?.includes("RATE_LIMIT_EXCEEDED") ||
        String(error?.message || "").includes("too quickly");

      if (isRateLimit) {
        Alert.alert(
          "Rate Limit",
          "You're sending messages too quickly. Please wait a moment before sending another message.",
          [{ text: "OK" }]
        );
        return;
      }

      const isPgrst204 =
        error?.code === "PGRST204" ||
        String(error?.message || "").includes("Could not find");
      const messageText = isPgrst204
        ? "Chat images require a database update. Run sql/add_chat_message_image.sql in Supabase SQL Editor, then reload schema (NOTIFY pgrst, 'reload schema')."
        : "Failed to send message. Please try again.";
      Alert.alert("Error", messageText);
      if (variables) {
        setMessage(variables.messageText); // Restore message on error
        if (variables.imageUrl) {
          setSelectedImage(variables.imageUrl); // Restore image on error
        }
      }
    },
  });

  // Pick image from library
  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        // Compress and resize image
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1080 } }],
          {
            compress: 0.7,
            format: ImageManipulator.SaveFormat.WEBP,
          }
        );
        setSelectedImage(manipResult.uri);
      }
    } catch (error) {
      logger.error("Error picking image", error as Error);
      Alert.alert("Error", "Failed to pick image. Please try again.");
    }
  }, []);

  const handleSend = useCallback(async () => {
    // Prevent double-tap / rapid sends
    if (isSendingRef.current || isSending) {
      return;
    }

    const messageText = message.trim();
    if (!id || !currentUserId) {
      return;
    }

    // Require either text or image
    if (!messageText && !selectedImage) {
      return;
    }

    // Mark as sending
    isSendingRef.current = true;
    setIsSending(true);

    // Rate limiting: Check if user has sent too many messages recently
    const now = Date.now();
    // Remove messages older than the time window
    messageSendTimes.current = messageSendTimes.current.filter(
      (time) => now - time < RATE_LIMIT_WINDOW_MS
    );

    // Check if over rate limit
    if (messageSendTimes.current.length >= RATE_LIMIT_MESSAGES) {
      const timeUntilNext = Math.ceil(
        (RATE_LIMIT_WINDOW_MS - (now - messageSendTimes.current[0])) / 1000
      );
      Alert.alert(
        "Rate Limit",
        `You're sending messages too quickly. Please wait ${timeUntilNext} second${timeUntilNext !== 1 ? "s" : ""} before sending another message.`,
        [{ text: "OK" }]
      );
      logger.warn("Message rate limit exceeded", {
        userId: currentUserId,
        chatId: id,
        messagesInWindow: messageSendTimes.current.length,
        timeUntilNext,
      });
      isSendingRef.current = false;
      return;
    }

    // Record this send attempt
    messageSendTimes.current.push(now);

    let imageUrl: string | null = null;
    const localImageUri = selectedImage; // Store local URI before upload

    // Upload image if selected
    if (selectedImage) {
      try {
        imageUrl = await uploadImage(selectedImage, supabase, "chat-images");
        setSelectedImage(null); // Clear selected image
      } catch (error) {
        logger.error("Error uploading image", error as Error);
        Alert.alert("Error", "Failed to upload image. Please try again.");
        isSendingRef.current = false;
        setIsSending(false);
        return;
      }
    }

    setMessage(""); // Clear input IMMEDIATELY
    sendMessageMutation.mutate(
      { messageText, imageUrl, localImageUri },
      {
        onSettled: () => {
          // Reset sending flag after mutation completes (success or error)
          isSendingRef.current = false;
          setIsSending(false);
        },
      }
    );
  }, [message, selectedImage, id, currentUserId, sendMessageMutation, isSending]);

  // Block user mutation
  const blockUserMutation = useMutation({
    mutationFn: async (blockedUserId: string) => {
      if (!currentUserId) {
        throw new Error("User not authenticated");
      }

      const { error } = await supabase
        .from("blocks")
        .insert({
          blocker_id: currentUserId,
          blocked_id: blockedUserId,
        });

      if (error) {
        // If already blocked, ignore the error
        if (error.code === "23505") {
          return; // Unique constraint violation means already blocked
        }
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate all queries to filter out blocked user's content
      queryClient.invalidateQueries({ queryKey: ["blocks", currentUserId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      queryClient.invalidateQueries({ queryKey: ["chat-summaries", currentUserId] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages", id] }); // Refresh messages to filter blocked user
      queryClient.invalidateQueries({ queryKey: ["global-unread-count", currentUserId] }); // Update unread count

      console.log("Success", "User has been blocked");
      router.back();
    },
    onError: (error) => {
      logger.error("Error blocking user", error, {
        userId: currentUserId,
        chatId: id,
        component: "ChatDetailScreen",
        operation: "blockUser",
        blockedUserId: otherUserId,
      });
      Alert.alert("Error", "Failed to block user. Please try again.");
    },
  });

  // Delete chat mutation
  const deleteChatMutation = useMutation({
    mutationFn: async () => {
      if (!id || !currentUserId) {
        throw new Error("Missing chat ID or user ID");
      }

      // Verify user is a participant in this chat (for RLS)
      const { data: chatData, error: chatCheckError } = await supabase
        .from("chats")
        .select("participant_1_id, participant_2_id")
        .eq("id", id)
        .single();

      if (chatCheckError || !chatData) {
        throw new Error("Chat not found or you don't have permission to delete it");
      }

      const isParticipant =
        chatData.participant_1_id === currentUserId ||
        chatData.participant_2_id === currentUserId;

      if (!isParticipant) {
        throw new Error("You are not a participant in this chat");
      }

      // First, delete all messages in this chat (to avoid FK errors)
      // Use RLS-friendly delete: only delete messages where user is sender or receiver
      const { data: deletedMessages, error: messagesError } = await supabase
        .from("chat_messages")
        .delete()
        .eq("chat_id", id)
        .select();

      if (messagesError) {
        console.error("Error deleting messages:", messagesError);
        // If RLS prevents deletion, try a different approach
        // Mark messages as deleted instead of actually deleting them
        const { error: softDeleteError } = await supabase
          .from("chat_messages")
          .update({
            deleted_by_sender: true,
            deleted_by_receiver: true,
          })
          .eq("chat_id", id);

        if (softDeleteError) {
          throw new Error(`Failed to delete messages: ${messagesError.message}`);
        }
        console.log("Soft-deleted messages due to RLS restrictions");
      } else {
        console.log(`Deleted ${deletedMessages?.length || 0} messages for chat ${id}`);
      }

      // Then, delete the chat itself
      // Note: .or() doesn't work with .delete(), so we rely on RLS policies
      // RLS should allow deletion if user is a participant
      const { data: deletedChats, error: chatError } = await supabase
        .from("chats")
        .delete()
        .eq("id", id)
        .select();

      if (chatError) {
        console.error("Error deleting chat:", chatError);
        console.error("Chat error code:", chatError.code);
        console.error("Chat error details:", chatError.details);
        throw new Error(`Failed to delete chat: ${chatError.message} (Code: ${chatError.code})`);
      }

      // Check if any rows were actually deleted
      if (!deletedChats || deletedChats.length === 0) {
        // No rows deleted - likely RLS blocked it or chat doesn't exist
        // Verify chat still exists
        const { data: existingChat } = await supabase
          .from("chats")
          .select("id, participant_1_id, participant_2_id")
          .eq("id", id)
          .single();

        if (existingChat) {
          // Chat exists but deletion was blocked - likely RLS issue
          const isParticipant =
            existingChat.participant_1_id === currentUserId ||
            existingChat.participant_2_id === currentUserId;

          if (!isParticipant) {
            throw new Error("You are not a participant in this chat");
          } else {
            throw new Error("Chat deletion was blocked. Please check your RLS policies allow participants to delete chats.");
          }
        } else {
          // Chat doesn't exist - deletion might have succeeded but we can't verify
          console.log("Chat doesn't exist - assuming deletion succeeded");
          return { deletedChat: null, deletedMessagesCount: deletedMessages?.length || 0 };
        }
      }

      console.log(`Successfully deleted chat ${id}`);
      return { deletedChat: deletedChats[0], deletedMessagesCount: deletedMessages?.length || 0 };
    },
    onMutate: async () => {
      // Don't await - cancel queries in background, don't block UI
      queryClient.cancelQueries({ queryKey: ["chat-summaries", currentUserId] });

      const previousSummaries = queryClient.getQueryData<any[]>(["chat-summaries", currentUserId]);

      // Optimistically remove chat from summaries IMMEDIATELY
      queryClient.setQueryData<any[]>(["chat-summaries", currentUserId], (oldSummaries: any[] | undefined) => {
        if (!oldSummaries) return oldSummaries;
        return oldSummaries.filter((summary: any) => summary.chat_id !== id);
      });

      // Optimistically update global unread count (subtract unread messages from this chat)
      queryClient.setQueryData<number>(["global-unread-count", currentUserId], (oldCount: number | undefined) => {
        if (oldCount === undefined || !previousSummaries) return oldCount;

        // Find the chat being deleted and subtract its unread count
        const deletedChat = previousSummaries.find((s: any) => s.chat_id === id);
        if (!deletedChat) return oldCount;

        const isP1 = deletedChat.participant_1_id === currentUserId;
        const unreadInDeletedChat = isP1 ? (deletedChat.unread_count_p1 || 0) : (deletedChat.unread_count_p2 || 0);

        return Math.max(0, oldCount - unreadInDeletedChat);
      });

      return { previousSummaries };
    },
    onSuccess: (data) => {
      console.log("Chat deletion successful:", data);

      // Remove queries for this chat
      queryClient.removeQueries({ queryKey: ["chat-messages", id] });
      queryClient.removeQueries({ queryKey: ["chat", id] });

      // Force refetch to ensure server state is synced
      // This ensures that if we refresh, the chat won't reappear
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries", currentUserId],
        refetchType: "active", // Force refetch to sync with server
      });
      queryClient.invalidateQueries({
        queryKey: ["global-unread-count", currentUserId],
        refetchType: "active",
      });

      // Navigate back immediately after optimistic update
      router.back();

      // Show success after navigation
      setTimeout(() => {
        console.log("Success", "Chat has been deleted");
      }, 100);
    },
    onError: (error, _variables, context) => {
      logger.error("Error deleting chat", error, {
        userId: currentUserId,
        chatId: id,
        component: "ChatDetailScreen",
        operation: "deleteChat",
        errorDetails: error instanceof Error ? error.message : String(error),
      });

      // Rollback optimistic update
      if (context?.previousSummaries) {
        queryClient.setQueryData(["chat-summaries", currentUserId], context.previousSummaries);
      }

      // Show detailed error message
      const errorMessage = error instanceof Error ? error.message : "Failed to delete chat. Please try again.";
      Alert.alert(
        "Error",
        errorMessage,
        [
          { text: "OK", style: "default" },
          {
            text: "Retry",
            style: "default",
            onPress: () => deleteChatMutation.mutate(),
          },
        ]
      );
    },
  });

  const handleHeaderMenu = useCallback(() => {
    if (!otherUserId || isAnonymous) return;

    const options: string[] = [];
    const actions: Array<() => void> = [];

    options.push("Block User", "Delete Chat", "Cancel");
    actions.push(
      () => {
        Alert.alert(
          "Block User",
          `Are you sure you want to block ${otherUserName}?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Block",
              style: "destructive",
              onPress: () => blockUserMutation.mutate(otherUserId!),
            },
          ]
        );
      },
      () => {
        Alert.alert(
          "Delete Chat",
          "Are you sure you want to delete this conversation? This action cannot be undone.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => deleteChatMutation.mutate(),
            },
          ]
        );
      },
      () => { }
    );

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: [0, 1], // Both Block and Delete are destructive
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          const action = actions[buttonIndex];
          if (action) action();
        }
      );
    } else {
      Alert.alert(
        "Chat Options",
        undefined,
        [
          {
            text: "Block User",
            style: "destructive",
            onPress: () => {
              Alert.alert(
                "Block User",
                `Are you sure you want to block ${otherUserName}?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Block",
                    style: "destructive",
                    onPress: () => blockUserMutation.mutate(otherUserId!),
                  },
                ]
              );
            },
          },
          {
            text: "Delete Chat",
            style: "destructive",
            onPress: () => {
              Alert.alert(
                "Delete Chat",
                "Are you sure you want to delete this conversation? This action cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => deleteChatMutation.mutate(),
                  },
                ]
              );
            },
          },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  }, [otherUserId, isAnonymous, otherUserName, blockUserMutation, deleteChatMutation]);

  const handleMessageLongPress = useCallback(
    (msg: ChatMessage) => {
      if (!currentUserId) return;

      const isCurrentUser = msg.user_id === currentUserId;
      const isDeletedForEveryone = (msg as any).is_deleted;

      const options: string[] = [];
      const actions: Array<() => void> = [];

      const addDeleteForMe = () => {
        deleteMessageMutation.mutate({
          messageId: msg.id,
          action: "delete_for_me",
          isSender: isCurrentUser,
        });
      };

      if (isCurrentUser && !isDeletedForEveryone) {
        options.push("Delete for me", "Delete for everyone", "Cancel");
        actions.push(
          addDeleteForMe,
          () =>
            deleteMessageMutation.mutate({
              messageId: msg.id,
              action: "delete_for_everyone",
              isSender: true,
            }),
          () => { }
        );
      } else {
        // Receiver or already deleted for everyone
        options.push("Delete for me", "Cancel");
        actions.push(addDeleteForMe, () => { });
      }

      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            destructiveButtonIndex: options.indexOf("Delete for everyone"),
            cancelButtonIndex: options.indexOf("Cancel"),
          },
          (buttonIndex) => {
            const action = actions[buttonIndex];
            if (action) action();
          }
        );
      } else {
        const androidButtons = options.map((label, idx) => {
          if (label === "Cancel") {
            return { text: "Cancel", style: "cancel" as const };
          }
          const onPress = actions[idx];
          return { text: label, onPress };
        });

        Alert.alert("Delete message", undefined, androidButtons);
      }
    },
    [currentUserId, deleteMessageMutation]
  );

  const handleRetrySend = useCallback(
    (msg: ChatMessage) => {
      if (!id || !currentUserId) return;
      const isCurrentUser = msg.user_id === currentUserId;
      if (!isCurrentUser) return;

      const payload = msg._clientPayload || {
        messageText: msg.content || "",
        imageUrl: msg.image_url || null,
        localImageUri: optimisticImageUris.current.get(msg.id) || null,
      };

      // Remove the failed optimistic message before retrying to avoid duplicates
      queryClient.setQueryData<MessagesQueryData>(["chat-messages", id], (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => page.filter((m) => m.id !== msg.id)),
        };
      });

      // Fire a new send with the original payload
      sendMessageMutation.mutate({
        messageText: payload.messageText,
        imageUrl: payload.imageUrl,
        localImageUri: payload.localImageUri || undefined,
      });
    },
    [id, currentUserId, queryClient, sendMessageMutation]
  );

  const renderMessage = ({
    item,
    index,
  }: {
    item: ChatMessage;
    index: number;
  }) => {
    const isCurrentUser = item.user_id === currentUserId;
    const deletedBySender = (item as any).deleted_by_sender;
    const deletedByReceiver = (item as any).deleted_by_receiver;
    const isDeletedForEveryone = (item as any).is_deleted;
    const sendStatus = item.sendStatus;

    // Hide message if it was deleted locally
    const isHiddenForCurrentUser =
      (isCurrentUser && deletedBySender) ||
      (!isCurrentUser && deletedByReceiver);

    if (isHiddenForCurrentUser) {
      return null;
    }
    // For inverted list: compare with next item (older message)
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
    const showDateDivider = shouldShowDateDivider(item, nextMsg);

    return (
      <>
        {/* Message bubble rendered first in JSX */}
        <Pressable
          style={[
            styles.messageContainer,
            isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage,
          ]}
          onLongPress={() => handleMessageLongPress(item)}
          onPress={() => {
            if (sendStatus === "failed") {
              handleRetrySend(item);
            }
          }}
        >
          <View
            style={[
              styles.messageBubble,
              {
                backgroundColor: "transparent", // Bubble container is transparent, individual parts have their own backgrounds
                borderRadius: 20,
                paddingHorizontal: 0,
                paddingVertical: 0,
                overflow: "hidden",
              },
            ]}
          >
            {/* Show image if present - white background, rounded top only when text below */}
            {item.image_url && !isDeletedForEveryone && (
              <Pressable
                style={[
                  styles.messageImageContainer,
                  item.content ? styles.messageImageContainerWithText : undefined,
                ]}
                onPress={() => !item.id.startsWith("temp-") && setFullScreenImagePath(item.image_url!)}
              >
                {/* Loading: white background + spinner (temp messages and while real image loads) */}
                {item.id.startsWith("temp-") ? (
                  <View style={[styles.messageImage, styles.messageImageLoading]}>
                    <ActivityIndicator size="large" color="#999" />
                  </View>
                ) : (
                  <SupabaseImage
                    path={item.image_url}
                    bucket="chat-images"
                    style={styles.messageImage}
                    loadingBackgroundColor="#FFFFFF"
                    loadingIndicatorColor="#999"
                  />
                )}
              </Pressable>
            )}
            {/* Show text content if present - teal background for current user, card for others */}
            {item.content && (
              <View
                style={[
                  styles.messageTextWrap,
                  {
                    backgroundColor: isDeletedForEveryone
                      ? theme.card
                      : isCurrentUser
                        ? sendStatus === "failed"
                          ? "#B91C1C" // red-ish for failed sends
                          : "#5DBEBC" // teal for current user
                        : theme.card,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomLeftRadius: 20,
                    borderBottomRightRadius: 20,
                    borderTopLeftRadius: item.image_url && !isDeletedForEveryone ? 0 : 20,
                    borderTopRightRadius: item.image_url && !isDeletedForEveryone ? 0 : 20,
                  },
                  item.image_url && !isDeletedForEveryone && styles.messageTextWrapWithImage,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    {
                      color: isDeletedForEveryone
                        ? theme.secondaryText
                        : isCurrentUser
                          ? "#FFFFFF"
                          : theme.text,
                      fontStyle: isDeletedForEveryone ? "italic" : "normal",
                    },
                  ]}
                >
                  {isDeletedForEveryone
                    ? "This message was deleted"
                    : item.content}
                </Text>
              </View>
            )}
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
          {isCurrentUser && sendStatus === "failed" && (
            <Text
              style={[
                styles.failedStatusText,
                { color: "#EF4444" },
              ]}
            >
              Failed to send. Tap to retry.
            </Text>
          )}
        </Pressable>
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
      marginRight: 16,
    },
    avatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 16,
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
      position: "relative",
      marginHorizontal: 16,
      marginBottom: 8,
      alignSelf: "flex-start",
    },
    imagePreview: {
      width: 200,
      height: 200,
      borderRadius: 12,
      resizeMode: "cover",
    },
    removeImageButton: {
      position: "absolute",
      top: -8,
      right: -8,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      borderRadius: 12,
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

        <Pressable
          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          onPress={() => {
            if (!isAnonymous && otherUserId && otherUserId !== currentUserId) {
              setProfileModalVisible(true);
            }
          }}
          disabled={isAnonymous || !otherUserId || otherUserId === currentUserId}
        >
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
            <Image source={DEFAULT_AVATAR} style={dynamicStyles.avatarImage} />
          )}

          <Text style={dynamicStyles.userName}>{otherUserName}</Text>
        </Pressable>

        {!isAnonymous && otherUserId && (
          <Pressable style={dynamicStyles.menuButton} onPress={handleHeaderMenu}>
            <Ionicons name="ellipsis-vertical" size={24} color={theme.text} />
          </Pressable>
        )}
      </View>

      {/* MESSAGES LIST */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {/* "New messages" pill when user has scrolled up */}
        {pendingNewMessages > 0 && !isAtBottom && (
          <Pressable
            style={styles.newMessagesPill}
            onPress={() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToOffset({ offset: 0, animated: true });
              }
              setPendingNewMessages(0);
            }}
          >
            <Text style={styles.newMessagesPillText}>
              {pendingNewMessages === 1
                ? "1 new message"
                : `${pendingNewMessages} new messages`}
            </Text>
          </Pressable>
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={dynamicStyles.messagesList}
          inverted={true}
          // Keep scroll position stable when loading older messages
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          // Tune performance for long chats with images
          windowSize={10}
          maxToRenderPerBatch={20}
          initialNumToRender={20}
          removeClippedSubviews
          onScroll={({ nativeEvent }) => {
            // For inverted list, offset 0 is the bottom (latest messages)
            const nearBottom = nativeEvent.contentOffset.y <= 80;
            if (nearBottom !== isAtBottomRef.current) {
              setIsAtBottom(nearBottom);
              if (nearBottom) {
                // User returned to bottom; clear any pending indicator
                setPendingNewMessages(0);
              }
            }
          }}
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

        {/* SELECTED IMAGE PREVIEW */}
        {selectedImage && (
          <View style={dynamicStyles.imagePreviewContainer}>
            <Image source={{ uri: selectedImage }} style={dynamicStyles.imagePreview} />
            <Pressable
              style={dynamicStyles.removeImageButton}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close-circle" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        )}

        {/* INPUT */}
        <View style={[
          dynamicStyles.inputContainer,
          { paddingBottom: isKeyboardVisible ? 15 : insets.bottom }
        ]}>
          <Pressable
            onPress={pickImage}
            style={dynamicStyles.imagePickerButton}
          >
            <Ionicons name="image-outline" size={24} color={theme.text} />
          </Pressable>
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
              { opacity: (!message.trim() && !selectedImage) || isSending ? 0.5 : 1 },
            ]}
            disabled={(!message.trim() && !selectedImage) || isSending}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* User Profile Modal */}
      {!isAnonymous && otherUserId && otherUserId !== currentUserId && (
        <UserProfileModal
          visible={profileModalVisible}
          onClose={() => setProfileModalVisible(false)}
          userId={otherUserId}
        />
      )}

      {/* Full-screen image modal - tap to close, two-finger pinch to zoom */}
      <Modal
        visible={Boolean(fullScreenImagePath)}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenImagePath(null)}
      >
        <Pressable
          style={fullScreenImageStyles.overlay}
          onPress={() => setFullScreenImagePath(null)}
        >
          {fullScreenImagePath && (
            <Animated.View
              style={[
                fullScreenImageStyles.imageWrap,
                {
                  transform: [
                    { translateX: translateXAnim },
                    { translateY: translateYAnim },
                    { scale: scaleAnim },
                  ],
                },
              ]}
              {...fullScreenPanResponder.panHandlers}
            >
              <Image
                source={{
                  uri: supabase.storage.from("chat-images").getPublicUrl(fullScreenImagePath).data.publicUrl,
                }}
                style={fullScreenImageStyles.fullScreenImage}
                resizeMode="contain"
              />
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const fullScreenImageStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrap: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});

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
    backgroundColor: "#FFFFFF", // White background for images
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
    bottom: 140, // Positioned above input area
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#111827CC", // semi-transparent dark background
    zIndex: 5,
  },
  newMessagesPillText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
});
