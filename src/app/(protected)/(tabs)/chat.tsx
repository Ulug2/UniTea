import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { moderateScale, verticalScale } from "../../../utils/scaling";
import { useTheme } from "../../../context/ThemeContext";
import ChatListItem from "../../../components/ChatListItem";
import ChatListSkeleton from "../../../components/ChatListSkeleton";
import { Database } from "../../../types/database.types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { logger } from "../../../utils/logger";
import {
  useBlocks,
  isBlockedChat,
  type BlockRecord,
} from "../../../hooks/useBlocks";
import { useRevealAfterFirstNImages } from "../../../hooks/useRevealAfterFirstNImages";
import { saveChatToStorage } from "../../../utils/feedPersistence";
import {
  getChatDisplayIdentity,
  resolveOtherParticipant,
} from "../../../features/chat/utils/getChatIdentity";
import { getCurrentViewedChatId } from "../../../hooks/usePushNotifications";

type Chat = Database["public"]["Tables"]["chats"]["Row"];
type User = Database["public"]["Tables"]["profiles"]["Row"];

type ChatSummary = {
  chat_id: string;
  participant_1_id: string;
  participant_2_id: string;
  post_id: string | null;
  created_at: string | null;
  last_message_at: string | null;
  last_message_content_p1: string | null;
  last_message_has_image_p1: boolean | null;
  last_message_content_p2: string | null;
  last_message_has_image_p2: boolean | null;
  unread_count_p1: number;
  unread_count_p2: number;
  is_anonymous: boolean | null;
  initiator_id: string | null;
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
          `participant_1_id.eq.${currentUserId},participant_2_id.eq.${currentUserId}`,
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
    // IMPORTANT: We seed chat summaries from AsyncStorage with updatedAt=0 (always stale)
    // so we need refetch-on-mount to populate newer schema fields (e.g. per-participant
    // last-message preview) on first run. Once fetched, staleTime prevents re-fetches.
    refetchOnMount: true,
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

  // Drive the pull-to-refresh spinner ONLY from user-initiated pulls. Binding it
  // to `isRefetchingChats` (any background refetch, e.g. refetch-on-mount after a
  // new chat invalidates the query) shows a programmatic RefreshControl that the
  // user never pulled — on iOS that spinner can get stuck and shift the list down.
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const onManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetchChats();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetchChats]);

  // Anonymous chats: postgres_changes on `chats` no longer fires for them
  // once the RLS-driven identity redaction is active (Realtime respects
  // SELECT RLS, and anonymous rows are invisible via the base table by
  // design). That leaves reopening the screen as the only remaining way
  // to pick up a new/updated anonymous chat's preview or ordering, so
  // refetch on focus rather than relying solely on refetchOnMount.
  // Non-anonymous chats are unaffected either way — they still update live
  // via the postgres_changes subscriptions below.
  useFocusEffect(
    useCallback(() => {
      if (!currentUserId) return;
      queryClient.invalidateQueries({
        queryKey: ["chat-summaries", currentUserId],
        refetchType: "active",
      });
    }, [currentUserId, queryClient]),
  );

  // Prevent stuck loading state: cancel refetch if it's been stuck for too long
  useEffect(() => {
    if (isRefetchingChats) {
      const timeout = setTimeout(() => {
        // If still refetching after 10 seconds, something went wrong - cancel it
        queryClient.cancelQueries({
          queryKey: ["chat-summaries", currentUserId],
        });
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

      if (isBlockedChat(blocks, otherUserId, chat.is_anonymous === true)) {
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
  // Three sources feed this screen:
  //   • Two filtered `postgres_changes` channels on the `chats` table —
  //     non-anonymous chats only. Realtime enforces the same restrictive
  //     RLS as direct reads, so these never fire for anonymous rows.
  //   • One private Broadcast channel (`chats:{currentUserId}`), a generic
  //     per-user "this chat changed, refetch it" signal — not anonymous-
  //     specific despite originating from that work. Two server-side
  //     sources send `chat_updated` {chat_id} on it: every anonymous
  //     message insert (broadcast_anonymous_chat_message(), the only
  //     live-update path anonymous chats have at all, since
  //     postgres_changes can't see them — see
  //     20260727000000_chat_list_live_update_broadcast.sql), and every
  //     delete-for-everyone for EITHER chat type (set_chat_message_deletion(),
  //     since deletion never touches a `chats` row for postgres_changes to
  //     fire on — see 20260728000000_unify_chat_message_deletion_rpc.sql).
  //
  // chat_messages listeners have been removed from this screen entirely:
  //   • The `chats` UPDATE event / the broadcast signal above are
  //     sufficient to know a message arrived or was deleted.
  //   • Per-message delivery is handled by the detail screen's own filtered
  //     channel (`chat-${chatId}` with `filter: "chat_id=eq.${chatId}"`).
  const channelErrorLoggedRef = useRef(false);
  useEffect(() => {
    if (!currentUserId) return;

    channelErrorLoggedRef.current = false;
    let isMounted = true;

    // Shared by both the postgres_changes UPDATE handler (non-anonymous)
    // and the chats:{userId} broadcast handler (anonymous): reorders the
    // list instantly using a last_message_at already on hand (from the
    // event payload), without waiting on a network round-trip. Preview
    // text/unread count aren't available yet here — applyFreshChatSummary
    // below fills those in right after.
    const patchLastMessageAtAndSort = (
      chatId: string,
      lastMessageAt: string | null,
    ) => {
      queryClient.setQueryData<ChatSummary[]>(
        ["chat-summaries", currentUserId],
        (oldSummaries) => {
          if (!oldSummaries) return oldSummaries;

          const chatIndex = oldSummaries.findIndex(
            (s) => s.chat_id === chatId,
          );

          if (chatIndex === -1) {
            // Not in the cached list yet (e.g. this chat's first-ever
            // message) — let the normal invalidate/refetch path pick it up.
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
              lastMessageAt || updated[chatIndex].last_message_at,
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
    };

    // Recomputes the global badge from whatever is CURRENTLY in the
    // chat-summaries cache. Must only ever run after that cache has been
    // written with real data — never before an in-flight fetch it depends
    // on has resolved (that was Bug C: the old code recomputed the badge
    // synchronously, before the async unread-count fetch it needed had
    // landed).
    const recomputeGlobalBadge = () => {
      const summaries = queryClient.getQueryData<ChatSummary[]>([
        "chat-summaries",
        currentUserId,
      ]);
      if (!summaries) return;

      const cachedBlocksForBadge =
        queryClient.getQueryData<BlockRecord[]>(["blocks", currentUserId]) ||
        [];
      const total = summaries.reduce((sum: number, chat: ChatSummary) => {
        const otherId =
          chat.participant_1_id === currentUserId
            ? chat.participant_2_id
            : chat.participant_1_id;
        if (
          isBlockedChat(cachedBlocksForBadge, otherId, chat.is_anonymous === true)
        )
          return sum;
        const isP1 = chat.participant_1_id === currentUserId;
        return (
          sum + (isP1 ? chat.unread_count_p1 || 0 : chat.unread_count_p2 || 0)
        );
      }, 0);

      queryClient.setQueriesData<number>(
        { queryKey: ["global-unread-count", currentUserId], exact: false },
        total,
      );
    };

    // Fetches the fresh row for one chat from user_chats_summary — preview
    // text/image flags + unread counts, none of which are on the `chats`
    // table payload or the broadcast signal — and patches it into the
    // cache, then recomputes the badge from the result. Shared by both
    // event sources so the fix applies identically to anonymous and
    // non-anonymous chats (Bug B: the old code only fetched unread counts,
    // never the preview text, so the list reordered but still showed the
    // previous message. Bug C: see recomputeGlobalBadge above).
    const applyFreshChatSummary = async (chatId: string) => {
      try {
        const isViewingThisChat = getCurrentViewedChatId() === chatId;

        const { data: freshRow } = await (supabase as any)
          .from("user_chats_summary")
          .select(
            "chat_id, last_message_at, last_message_content_p1, last_message_has_image_p1, last_message_content_p2, last_message_has_image_p2, unread_count_p1, unread_count_p2, participant_1_id, participant_2_id",
          )
          .eq("chat_id", chatId)
          .maybeSingle();

        if (!isMounted) return;

        queryClient.setQueryData<ChatSummary[]>(
          ["chat-summaries", currentUserId],
          (old) => {
            if (!old) return old;

            if (!freshRow) {
              // No longer visible to us (e.g. blocked in the meantime).
              return old.filter((s) => s.chat_id !== chatId);
            }

            const existingIndex = old.findIndex((s) => s.chat_id === chatId);
            if (existingIndex === -1) return old;

            const existing = old[existingIndex];

            // Guard against a burst of rapid messages resolving out of
            // order: never let an older read overwrite a newer one.
            const existingTime = existing.last_message_at
              ? new Date(existing.last_message_at).getTime()
              : 0;
            const freshTime = freshRow.last_message_at
              ? new Date(freshRow.last_message_at).getTime()
              : 0;
            if (freshTime < existingTime) return old;

            const isP1 = freshRow.participant_1_id === currentUserId;
            const updated = [...old];
            updated[existingIndex] = {
              ...existing,
              last_message_at: freshRow.last_message_at,
              last_message_content_p1: freshRow.last_message_content_p1,
              last_message_has_image_p1: freshRow.last_message_has_image_p1,
              last_message_content_p2: freshRow.last_message_content_p2,
              last_message_has_image_p2: freshRow.last_message_has_image_p2,
              // User is in this chat right now — the realtime hook already
              // marks incoming messages as read, so force the cached count
              // to zero regardless of what the (possibly not-yet-caught-up)
              // fetch reports.
              unread_count_p1:
                isViewingThisChat && isP1 ? 0 : freshRow.unread_count_p1,
              unread_count_p2:
                isViewingThisChat && !isP1 ? 0 : freshRow.unread_count_p2,
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

        recomputeGlobalBadge();
      } catch {
        // Non-critical — will sync on next focus/manual refresh.
      }
    };

    // Shared handler for all chats-table events on both postgres_changes channels.
    const handleChatEvent = (payload: any) => {
      if (!isMounted) return;

      const { eventType } = payload;

      try {
        if (eventType === "DELETE") {
          const deletedChatId = payload.old?.id;
          if (deletedChatId) {
            queryClient.setQueryData<ChatSummary[]>(
              ["chat-summaries", currentUserId],
              (old) =>
                old ? old.filter((s) => s.chat_id !== deletedChatId) : old,
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
          const insertedChat = payload.new as any;
          const otherUserId =
            insertedChat?.participant_1_id === currentUserId
              ? insertedChat?.participant_2_id
              : insertedChat?.participant_1_id;
          const cachedBlocks =
            queryClient.getQueryData<BlockRecord[]>([
              "blocks",
              currentUserId,
            ]) || [];
          if (isBlockedChat(cachedBlocks, otherUserId, insertedChat?.is_anonymous === true)) {
            return;
          }

          // New chat — rare event; invalidate so the list re-fetches on next access.
          queryClient.invalidateQueries({
            queryKey: ["chat-summaries", currentUserId],
            refetchType: "none",
          });
          return;
        }

        if (eventType === "UPDATE") {
          const updatedChat = payload.new as any;
          const otherUserId =
            updatedChat?.participant_1_id === currentUserId
              ? updatedChat?.participant_2_id
              : updatedChat?.participant_1_id;
          const cachedBlocks =
            queryClient.getQueryData<BlockRecord[]>([
              "blocks",
              currentUserId,
            ]) || [];
          if (isBlockedChat(cachedBlocks, otherUserId, updatedChat?.is_anonymous === true)) {
            return;
          }

          // Instant reorder from the payload; preview text/unread count
          // are filled in right after by applyFreshChatSummary.
          patchLastMessageAtAndSort(
            updatedChat.id,
            updatedChat.last_message_at ?? null,
          );
          applyFreshChatSummary(updatedChat.id as string);
        }
      } catch (error) {
        logger.error("Error handling chat realtime event", error, {
          userId: currentUserId,
          component: "ChatScreen",
          eventType,
        });
      }
    };

    // Handler for the chats:{userId} broadcast — the only live-update path
    // anonymous chats have (Bug A fix).
    const handleListRefreshBroadcast = (payload: any) => {
      if (!isMounted) return;

      try {
        const signal = payload?.payload as
          | { chat_id?: string; last_message_at?: string }
          | undefined;
        if (!signal?.chat_id) return;

        patchLastMessageAtAndSort(
          signal.chat_id,
          signal.last_message_at ?? null,
        );
        applyFreshChatSummary(signal.chat_id);
      } catch (error) {
        logger.error("Error handling chat list refresh broadcast", error, {
          userId: currentUserId,
          component: "ChatScreen",
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
          {
            userId: currentUserId,
            component: "ChatScreen",
            channel: channelName,
            status,
          },
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
    // Note: these two subscriptions silently stop delivering events for
    // anonymous chats (Realtime enforces the same restrictive RLS as
    // direct reads) — that's expected, not an error; the chats:{userId}
    // broadcast channel below is what keeps anonymous chats live instead.
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

    // Channel C — private broadcast signal for anonymous chats (Bug A fix).
    // Sent by broadcast_anonymous_chat_message() to chats:{recipientId} and
    // chats:{senderId} on every anonymous message insert; see
    // 20260727000000_chat_list_live_update_broadcast.sql.
    const channelBroadcast = supabase
      .channel(`chats:${currentUserId}`, { config: { private: true } })
      .on("broadcast", { event: "chat_updated" }, handleListRefreshBroadcast)
      .subscribe(onStatus(`chats-broadcast-${currentUserId}`));

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
      if (typeof (supabase as any).removeChannel === "function") {
        (supabase as any).removeChannel(channelP1);
      }
      channelP2.unsubscribe();
      if (typeof (supabase as any).removeChannel === "function") {
        (supabase as any).removeChannel(channelP2);
      }
      channelBroadcast.unsubscribe();
      if (typeof (supabase as any).removeChannel === "function") {
        (supabase as any).removeChannel(channelBroadcast);
      }
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
      if (chat.is_anonymous === true) {
        return;
      }
      ids.add(chat.participant_1_id);
      ids.add(chat.participant_2_id);
    });
    return Array.from(ids)
      .filter((id: string) => id !== currentUserId)
      .filter((id: string) => !id.startsWith("anonymous-"))
      .sort();
  }, [chatSummaries, currentUserId]);

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

  const getOtherUser = useCallback(
    (chat: ChatSummary): { user: User | null; isAnonymous: boolean } => {
      const { otherUserId, isAnonymous } = resolveOtherParticipant(
        chat,
        currentUserId,
      );

      if (isAnonymous) {
        return { user: null, isAnonymous: true };
      }

      const user = users.find((u) => u.id === otherUserId) || null;
      return { user, isAnonymous: false };
    },
    [currentUserId, users],
  );

  // Get unread count based on which participant is current user
  const getUnreadCount = useCallback(
    (chat: ChatSummary): number => {
      return chat.participant_1_id === currentUserId
        ? chat.unread_count_p1
        : chat.unread_count_p2;
    },
    [currentUserId],
  );

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
      const { user, isAnonymous: isLegacyAnon } = getOtherUser(item);
      const otherUserId =
        item.participant_1_id === currentUserId
          ? item.participant_2_id
          : item.participant_1_id;

      const identity = getChatDisplayIdentity(item, currentUserId, user);
      const isAnonymous = isLegacyAnon || identity.isAnonymousChat;

      const isP1 = item.participant_1_id === currentUserId;
      const lastMessageContent = isP1
        ? item.last_message_content_p1
        : item.last_message_content_p2;
      const lastMessageHasImage = isP1
        ? item.last_message_has_image_p1
        : item.last_message_has_image_p2;

      return (
        <ChatListItem
          chatId={item.chat_id}
          lastMessageAt={item.last_message_at}
          otherUser={user}
          lastMessage={lastMessageContent ?? ""}
          lastMessageHasImage={lastMessageHasImage === true}
          unreadCount={getUnreadCount(item)}
          isAnonymous={isAnonymous}
          displayName={
            identity.isAnonymousChat ? identity.displayName : undefined
          }
          onImageLoad={index < 5 ? onItemReady : undefined}
          onBeforeNavigate={() => {
            const syntheticChat = {
              id: item.chat_id,
              participant_1_id: item.participant_1_id,
              participant_2_id: item.participant_2_id,
              post_id: item.post_id,
              created_at: item.created_at,
              last_message_at: item.last_message_at,
              is_anonymous: item.is_anonymous ?? false,
              initiator_id: item.initiator_id,
            };
            queryClient.setQueryData(["chat", item.chat_id], syntheticChat, {
              updatedAt: 0,
            });
            if (user && !isAnonymous) {
              queryClient.setQueryData(["chat-other-user", otherUserId], user, {
                updatedAt: 0,
              });
            }
          }}
        />
      );
    },
    [getOtherUser, getUnreadCount, onItemReady, queryClient, currentUserId],
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    emptyContainer: {
      justifyContent: "center",
      alignItems: "center",
      paddingTop: verticalScale(100),
    },
    emptyText: {
      fontSize: moderateScale(16),
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
              refreshing={isManualRefreshing}
              onRefresh={onManualRefresh}
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
