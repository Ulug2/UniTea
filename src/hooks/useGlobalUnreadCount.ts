import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useBlocks } from "./useBlocks";

// Derives the total unread chat count for the app icon badge + chat tab badge.
// Source of truth is the `user_chats_summary` view (unread_count_p1/p2).
export function useGlobalUnreadCount() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const { data: blocks = [] } = useBlocks();

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["global-unread-count", currentUserId, blocks],
    queryFn: async () => {
      if (!currentUserId) return 0;

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

      // Sum unread counts while excluding chats involving blocked users.
      return data.reduce((sum: number, chat: any) => {
        const otherUserId =
          chat.participant_1_id === currentUserId
            ? chat.participant_2_id
            : chat.participant_1_id;

        // `useBlocks()` includes both scopes; for unread count we exclude any
        // blocked-user chat regardless of scope.
        const isBlocked = blocks.some((b: any) => b.userId === otherUserId);
        if (isBlocked) return sum;

        const isP1 = chat.participant_1_id === currentUserId;
        return sum + (isP1 ? chat.unread_count_p1 || 0 : chat.unread_count_p2 || 0);
      }, 0);
    },
    enabled: Boolean(currentUserId),
    // The realtime chat screen updates this cache directly via `setQueriesData`,
    // so we don't want background refetches to race with optimistic updates.
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
  });

  return unreadCount;
}

