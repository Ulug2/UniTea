import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Keyboard,
  ActionSheetIOS,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../context/ThemeContext";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { Database } from "../../../types/database.types";
import {
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import ChatDetailSkeleton from "../../../components/ChatDetailSkeleton";
import SupabaseImage from "../../../components/SupabaseImage";
import { logger } from "../../../utils/logger";
import { pickChatImage } from "../../../features/chat/utils/imagePicker";
import UserProfileModal from "../../../components/UserProfileModal";
import { useMyProfile } from "../../../features/profile/hooks/useMyProfile";
import { DEFAULT_AVATAR } from "../../../constants/images";
import { useBlocks } from "../../../hooks/useBlocks";
import { setCurrentViewedChatPartnerId } from "../../../hooks/usePushNotifications";
import { hashStringToNumber } from "../../../features/chat/utils/anon";
import type { ChatMessageVM } from "../../../features/chat/types";
import { selectMessages } from "../../../features/chat/types";
import { FullscreenImageModal } from "../../../features/chat/components/FullscreenImageModal";
import { useChatMessagesInfinite } from "../../../features/chat/hooks/useChatMessagesInfinite";
import { useChatMessagesRealtime } from "../../../features/chat/hooks/useChatMessagesRealtime";
import { useChatSendMessage } from "../../../features/chat/hooks/useChatSendMessage";
import { useChatMessageActions } from "../../../features/chat/hooks/useChatMessageActions";
import { useChatAutoScroll } from "../../../features/chat/hooks/useChatAutoScroll";
import { makeChatDetailStyles, chatDetailStyles } from "../../../features/chat/styles";
import { ChatHeader } from "../../../features/chat/components/ChatHeader";
import { ChatComposer } from "../../../features/chat/components/ChatComposer";
import { ChatMessageList } from "../../../features/chat/components/ChatMessageList";
import { ChatMessageRow } from "../../../features/chat/components/ChatMessageRow";

type Chat = Database["public"]["Tables"]["chats"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const dynamicStyles = useMemo(
    () => makeChatDetailStyles(theme, isDark, insets),
    [theme, isDark, insets]
  );
  const [message, setMessage] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [fullScreenImagePath, setFullScreenImagePath] = useState<string | null>(null);
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: currentUser } = useMyProfile(currentUserId);
  const isAdmin = currentUser?.is_admin === true;
  const queryClient = useQueryClient();

  // Track pending message IDs to prevent duplicate processing from real-time
  const pendingMessageIds = useRef<Set<string>>(new Set());
  // Track local image URIs for optimistic messages (tempId -> localUri)
  const optimisticImageUris = useRef<Map<string, string>>(new Map());

  // Cleanup optimistic image URIs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      optimisticImageUris.current.clear();
      pendingMessageIds.current.clear();
    };
  }, []);

  // Ref to the messages FlatList to allow imperative scrolling
  const flatListRef = useRef<FlatList<ChatMessageVM> | null>(null);

  const {
    onScroll: onListScroll,
    scrollToBottom,
    isAtBottom,
    isAtBottomRef,
    pendingNewCount,
    clearPending,
    incrementPending,
    hasScrolledInitiallyRef,
  } = useChatAutoScroll(flatListRef);

  const { send, retry, isSending } = useChatSendMessage(id ?? "", currentUserId ?? "", {
    pendingMessageIdsRef: pendingMessageIds,
    optimisticImageUrisRef: optimisticImageUris,
    flatListRef,
    onRestoreInput: (messageText, localImageUri) => {
      setMessage(messageText);
      setSelectedImage(localImageUri);
    },
  });

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

  // Tell notification handler which chat we're viewing so it can suppress banners for this chat only
  useFocusEffect(
    useCallback(() => {
      setCurrentViewedChatPartnerId(otherUserId ?? null);
      return () => setCurrentViewedChatPartnerId(null);
    }, [otherUserId])
  );

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

  // Fetch messages with pagination
  const {
    data: messagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingMessages,
  } = useChatMessagesInfinite(id ?? "", { pageSize: 20 });

  // Flatten and filter out blocked users' messages
  const messages = useMemo(
    () => selectMessages(messagesData, blocks),
    [messagesData, blocks]
  );

  const { openMessageActionSheet } = useChatMessageActions(id ?? "", currentUserId ?? undefined);

  const handleIncomingMessage = useCallback(() => {
    if (isAtBottomRef.current) {
      setTimeout(() => scrollToBottom(true), 100);
    } else {
      incrementPending();
    }
  }, [scrollToBottom, incrementPending]);

  useChatMessagesRealtime(id ?? "", currentUserId ?? "", {
    pendingMessageIdsRef: pendingMessageIds,
    onIncomingMessage: handleIncomingMessage,
  });

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

        const newPages = oldData.pages.map((page: ChatMessageVM[]) =>
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

  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom when messages are first loaded for a chat
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current && hasScrolledInitiallyRef.current !== id) {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        if (flatListRef.current) {
          scrollToBottom(false);
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
  }, [messages.length, id, scrollToBottom]);

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

      const timer = setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ["chat-messages", id],
          refetchType: "active",
        });
        scrollTimer = setTimeout(() => {
          if (flatListRef.current) {
            scrollToBottom(true);
            hasScrolledInitiallyRef.current = id;
          }
        }, 400);
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scrollTimer) {
          clearTimeout(scrollTimer);
        }
      };
    }, [id, queryClient])
  );

  const getMessageTime = useCallback((dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return format(date, "h:mm a");
  }, []);

  const getDateDivider = useCallback((dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  }, []);

  const shouldShowDateDivider = useCallback(
    (currentMsg: ChatMessageVM, nextMsg: ChatMessageVM | null) => {
      if (!nextMsg || !currentMsg.created_at || !nextMsg.created_at) return true;
      const currentDate = new Date(currentMsg.created_at);
      const nextDate = new Date(nextMsg.created_at);
      return !isSameDay(currentDate, nextDate);
    },
    []
  );

  const handleSend = useCallback(() => {
    send({ text: message, localImageUri: selectedImage });
    setMessage("");
    setSelectedImage(null);
  }, [message, selectedImage, send]);

  const handlePickImage = useCallback(async () => {
    const result = await pickChatImage();
    if (result) setSelectedImage(result.localUri);
  }, []);

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

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessageVM; index: number }) => {
      const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
      return (
        <ChatMessageRow
          item={item}
          nextMsg={nextMsg}
          currentUserId={currentUserId}
          theme={theme}
          onLongPress={openMessageActionSheet}
          onRetry={retry}
          onImagePress={setFullScreenImagePath}
          getMessageTime={getMessageTime}
          getDateDivider={getDateDivider}
          shouldShowDateDivider={shouldShowDateDivider}
        />
      );
    },
    [
      messages.length,
      currentUserId,
      theme,
      openMessageActionSheet,
      retry,
      getMessageTime,
      getDateDivider,
      shouldShowDateDivider,
    ]
  );

  // Show skeleton loading screen while chat or user data is loading
  // This prevents "Unknown User" flicker and ensures complete data before render
  const isInitialLoading = isLoadingChat || (isLoadingUser && !isAnonymous);

  if (isInitialLoading) {
    return <ChatDetailSkeleton />;
  }

  const headerAvatar = !isAnonymous && otherUser?.avatar_url ? (
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
  );

  return (
    <View style={dynamicStyles.container}>
      <ChatHeader
        displayName={otherUserName}
        avatarElement={headerAvatar}
        onRowPress={
          !isAnonymous && otherUserId && otherUserId !== currentUserId
            ? () => setProfileModalVisible(true)
            : undefined
        }
        onMenuPress={!isAnonymous && otherUserId ? handleHeaderMenu : undefined}
        showMenu={!isAnonymous && !!otherUserId}
        iconColor={theme.text}
        styles={dynamicStyles}
      />

      {/* MESSAGES LIST */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ChatMessageList
          messages={messages}
          listRef={flatListRef}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={dynamicStyles.messagesList}
          inverted
          onScroll={onListScroll}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          newMessagesPillCount={pendingNewCount}
          onNewMessagesPress={() => {
            scrollToBottom(true);
            clearPending();
          }}
          isAtBottom={isAtBottom}
          newMessagesPillStyles={{
            pill: chatDetailStyles.newMessagesPill as StyleProp<ViewStyle>,
            text: chatDetailStyles.newMessagesPillText as StyleProp<TextStyle>,
          }}
          theme={theme}
        />

        <ChatComposer
          value={message}
          onChangeText={setMessage}
          onSend={handleSend}
          onPickImage={handlePickImage}
          selectedImageUri={selectedImage}
          onRemoveImage={() => setSelectedImage(null)}
          isSending={isSending}
          disabled={!message.trim() && !selectedImage}
          textColor={theme.text}
          placeholderColor={theme.secondaryText}
          styles={dynamicStyles}
          paddingBottom={isKeyboardVisible ? 15 : insets.bottom}
        />
      </KeyboardAvoidingView>

      {/* User Profile Modal */}
      {!isAnonymous && otherUserId && otherUserId !== currentUserId && (
        <UserProfileModal
          visible={profileModalVisible}
          onClose={() => setProfileModalVisible(false)}
          userId={otherUserId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      )}

      <FullscreenImageModal
        visible={Boolean(fullScreenImagePath)}
        imagePath={fullScreenImagePath}
        onClose={() => setFullScreenImagePath(null)}
      />
    </View>
  );
}