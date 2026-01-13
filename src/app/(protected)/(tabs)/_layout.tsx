import { Tabs } from "expo-router";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";

// Create a context for filter state
type FeedFilter = "hot" | "new" | "top";
const FilterContext = createContext<{
  selectedFilter: FeedFilter;
  setSelectedFilter: (filter: FeedFilter) => void;
}>({
  selectedFilter: "hot",
  setSelectedFilter: () => {},
});

export const useFilterContext = () => useContext(FilterContext);

// Hook to get global unread count for chat tab badge
function useGlobalUnreadCount() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  // Debounce refs to prevent cascading invalidations
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const updateDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["global-unread-count", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return 0;

      // Fetch all chat summaries and sum unread counts
      const { data, error } = await (supabase as any)
        .from("user_chats_summary")
        .select(
          "unread_count_p1, unread_count_p2, participant_1_id, participant_2_id"
        )
        .or(
          `participant_1_id.eq.${currentUserId},participant_2_id.eq.${currentUserId}`
        );

      if (error) throw error;
      if (!data) return 0;

      // Sum up unread counts based on which participant is current user
      const total = data.reduce((sum: number, chat: any) => {
        const isP1 = chat.participant_1_id === currentUserId;
        const unread = isP1
          ? chat.unread_count_p1 || 0
          : chat.unread_count_p2 || 0;
        return sum + unread;
      }, 0);

      return total;
    },
    enabled: Boolean(currentUserId),
    staleTime: 1000 * 5, // Stale after 5 seconds (reduced from 0 to prevent over-fetching)
    gcTime: 1000 * 60 * 5, // Cache for 5 minutes
    refetchInterval: 1000 * 30, // Refetch every 30 seconds as fallback
  });

  // Subscribe to real-time changes on chat_messages to update badge with debouncing
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel("global-unread-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          // Skip our own messages entirely - they don't affect our unread count
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
            queryClient.invalidateQueries({
              queryKey: ["global-unread-count", currentUserId],
            });
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
          // Debounce message updates (read status changes) - 1 second
          if (updateDebounceRef.current) {
            clearTimeout(updateDebounceRef.current);
          }
          updateDebounceRef.current = setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ["global-unread-count", currentUserId],
            });
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      // Cleanup timeouts on unmount
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (updateDebounceRef.current) {
        clearTimeout(updateDebounceRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [currentUserId, queryClient]);

  return unreadCount;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [selectedFilter, setSelectedFilter] = useState<FeedFilter>("hot");
  return (
    <FilterContext.Provider value={{ selectedFilter, setSelectedFilter }}>
      {children}
    </FilterContext.Provider>
  );
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
  const globalUnreadCount = useGlobalUnreadCount();

  return (
    <FilterProvider>
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
            headerTitle: "UniTea",
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
    </FilterProvider>
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
