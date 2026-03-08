import { Tabs } from "expo-router";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import React, { useEffect, useRef } from "react";
import { View, Pressable, StyleSheet, AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useBlocks } from "../../../hooks/useBlocks";
import {
  FilterProvider,
  useFilterContext,
} from "../../../context/FilterContext";

// Hook to get global unread count for chat tab badge.
//
// The badge count is derived entirely from the `chat-summaries` cache that
// chat.tsx keeps up-to-date via its two filtered Realtime channels.
// No separate chat_messages subscription is needed here, and staleTime is
// set to Infinity so the query never re-fetches on its own — it is only
// refreshed when the app comes to foreground (AppState listener below) or
// when chat.tsx's handleChatEvent calls setQueriesData.
function useGlobalUnreadCount() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  const { data: blocks = [] } = useBlocks();

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["global-unread-count", currentUserId, blocks],
    queryFn: async () => {
      if (!currentUserId) return 0;

      const { data, error } = await (supabase as any)
        .from("user_chats_summary")
        .select(
          "unread_count_p1, unread_count_p2, participant_1_id, participant_2_id",
        )
        .or(
          `participant_1_id.eq.${currentUserId},participant_2_id.eq.${currentUserId}`,
        );

      if (error) throw error;
      if (!data) return 0;

      return data.reduce((sum: number, chat: any) => {
        const otherUserId =
          chat.participant_1_id === currentUserId
            ? chat.participant_2_id
            : chat.participant_1_id;
        if (blocks.includes(otherUserId)) return sum;
        const isP1 = chat.participant_1_id === currentUserId;
        return sum + (isP1 ? chat.unread_count_p1 || 0 : chat.unread_count_p2 || 0);
      }, 0);
    },
    enabled: Boolean(currentUserId),
    // Never re-fetches on its own; chat.tsx's filtered Realtime channels call
    // setQueriesData to keep this value current without any DB round-trips.
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
  });

  return unreadCount;
}

function FilterButtons() {
  const { theme } = useTheme();
  const { selectedFilter, setSelectedFilter } = useFilterContext();

  return (
    <View style={styles.filterButtons}>
      <Pressable
        style={[
          styles.filterBtn,
          selectedFilter === "hot" && { backgroundColor: theme.primary + "20" },
        ]}
        onPress={() => setSelectedFilter("hot")}
      >
        <FontAwesome
          name="fire"
          size={18}
          color={selectedFilter === "hot" ? theme.primary : theme.secondaryText}
        />
      </Pressable>
      <Pressable
        style={[
          styles.filterBtn,
          selectedFilter === "new" && { backgroundColor: theme.primary + "20" },
        ]}
        onPress={() => setSelectedFilter("new")}
      >
        <FontAwesome
          name="clock-o"
          size={18}
          color={selectedFilter === "new" ? theme.primary : theme.secondaryText}
        />
      </Pressable>
      <Pressable
        style={[
          styles.filterBtn,
          selectedFilter === "top" && { backgroundColor: theme.primary + "20" },
        ]}
        onPress={() => setSelectedFilter("top")}
      >
        <FontAwesome
          name="trophy"
          size={18}
          color={selectedFilter === "top" ? theme.primary : theme.secondaryText}
        />
      </Pressable>
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();
  const globalUnreadCount = useGlobalUnreadCount();

  // When app comes to foreground, refetch unread count so tab badge and app icon badge stay correct
  useEffect(() => {
    if (!currentUserId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        queryClient.refetchQueries({
          queryKey: ["global-unread-count", currentUserId],
          exact: false,
        });
      }
    });
    return () => sub.remove();
  }, [currentUserId, queryClient]);

  // Keep app icon badge in sync with chat unread count
  useEffect(() => {
    const count = typeof globalUnreadCount === "number" ? globalUnreadCount : 0;
    Notifications.setBadgeCountAsync(count).catch(() => {});
  }, [globalUnreadCount]);

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.secondaryText,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            height: 80,
          },
          headerStyle: {
            backgroundColor: theme.background,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            height: 100,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Feed",
            headerTitle: "UniTee",
            headerTitleAlign: "left",
            headerTitleStyle: {
              fontSize: 28,
              fontWeight: "bold",
              color: theme.text,
            },
            headerRight: () => <FilterButtons />,
            tabBarIcon: ({ color }) => (
              <Ionicons name="home-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            headerTitleAlign: "center",
            headerTitleStyle: {
              fontSize: 24,
              fontWeight: "bold",
              color: theme.text,
            },
            tabBarIcon: ({ color }) => (
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={24}
                color={color}
              />
            ),
            tabBarBadge: globalUnreadCount > 0 ? globalUnreadCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: "#EF4444",
              fontSize: 11,
              minWidth: 18,
              height: 18,
            },
          }}
        />
        <Tabs.Screen
          name="lostfound"
          options={{
            title: "Lost & Found",
            headerTitleAlign: "center",
            headerTitleStyle: {
              fontSize: 24,
              fontWeight: "bold",
              color: theme.text,
            },
            tabBarIcon: ({ color }) => (
              <Ionicons name="bag-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            headerTitleAlign: "center",
            headerTitleStyle: {
              fontSize: 24,
              fontWeight: "bold",
              color: theme.text,
            },
            tabBarIcon: ({ color }) => (
              <Ionicons name="person-outline" size={24} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  filterButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 16,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
