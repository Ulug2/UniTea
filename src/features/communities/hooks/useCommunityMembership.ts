import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useAuth } from "../../../context/AuthContext";
import { logger } from "../../../utils/logger";
import { communityMembersTable } from "../data/client";
import { communityKeys } from "../data/queryKeys";
import type { Community } from "../types";

/**
 * Join a community. Uses an idempotent upsert so rapid double-taps can't throw
 * a duplicate primary-key error, and optimistically updates the "my
 * communities" cache with rollback on failure.
 */
export function useJoinCommunity() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (community: Community) => {
      if (!userId) throw new Error("You must be logged in to join a community.");

      const { error } = await communityMembersTable().upsert(
        { community_id: community.id, user_id: userId },
        { onConflict: "community_id,user_id", ignoreDuplicates: true },
      );

      if (error) throw error;
      return community;
    },
    onMutate: async (community: Community) => {
      const key = communityKeys.mine(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Community[]>(key);

      queryClient.setQueryData<Community[]>(key, (old) => {
        const list = old ?? [];
        if (list.some((c) => c.id === community.id)) return list;
        return [community, ...list];
      });

      return { previous };
    },
    onError: (error, _community, context) => {
      if (context?.previous) {
        queryClient.setQueryData(communityKeys.mine(userId), context.previous);
      }
      logger.error("Failed to join community", error as Error);
      Alert.alert("Error", "Could not join the community. Please try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.mine(userId) });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

/**
 * Leave a community. Optimistically removes it from the "my communities"
 * cache with rollback on failure.
 */
export function useLeaveCommunity() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (communityId: string) => {
      if (!userId) throw new Error("You must be logged in.");

      const { error } = await communityMembersTable()
        .delete()
        .eq("community_id", communityId)
        .eq("user_id", userId);

      if (error) throw error;
      return communityId;
    },
    onMutate: async (communityId: string) => {
      const key = communityKeys.mine(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Community[]>(key);

      queryClient.setQueryData<Community[]>(key, (old) =>
        (old ?? []).filter((c) => c.id !== communityId),
      );

      return { previous };
    },
    onError: (error, _communityId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(communityKeys.mine(userId), context.previous);
      }
      logger.error("Failed to leave community", error as Error);
      Alert.alert("Error", "Could not leave the community. Please try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.mine(userId) });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}
