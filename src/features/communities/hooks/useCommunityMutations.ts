import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useAuth } from "../../../context/AuthContext";
import { logger } from "../../../utils/logger";
import { communitiesTable } from "../data/client";
import { communityKeys } from "../data/queryKeys";
import type { Community, CommunityInsert } from "../types";
import {
  normalizeCommunityDescription,
  normalizeCommunityName,
} from "../../../utils/communityValidation";

export type CreateCommunityInput = {
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
};

export type UpdateCommunityInput = {
  id: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
};

/** Create a community. The DB trigger fills university_id and auto-joins the creator. */
export function useCreateCommunity() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCommunityInput) => {
      if (!userId) throw new Error("You must be logged in.");
      const name = normalizeCommunityName(input.name);
      const description = normalizeCommunityDescription(input.description);

      // university_id is intentionally omitted: the BEFORE INSERT trigger
      // set_community_university_id() fills it from the creator's profile.
      const payload = {
        name,
        description,
        avatar_url: input.avatarUrl || null,
        created_by: userId,
      } satisfies Omit<CommunityInsert, "university_id">;

      const { data, error } = await communitiesTable()
        .insert(payload as CommunityInsert)
        .select(
          "id, name, description, avatar_url, university_id, created_by, created_at",
        )
        .single();

      if (error) throw error;
      return data as Community;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.mine(userId) });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
    onError: (error) => {
      logger.error("Failed to create community", error as Error);
      const message =
        error instanceof Error && error.message.includes("duplicate key")
          ? "A community with this name already exists at your university."
          : error instanceof Error
            ? error.message
            : "Could not create the community. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

/** Update a community's name, description, or avatar (creator only, enforced by RLS). */
export function useUpdateCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCommunityInput) => {
      const name = normalizeCommunityName(input.name);
      const description = normalizeCommunityDescription(input.description);

      const { data, error } = await communitiesTable()
        .update({
          name,
          description,
          avatar_url: input.avatarUrl || null,
        })
        .eq("id", input.id)
        .select(
          "id, name, description, avatar_url, university_id, created_by, created_at",
        )
        .single();

      if (error) throw error;
      return data as Community;
    },
    onSuccess: (community) => {
      queryClient.invalidateQueries({
        queryKey: communityKeys.detail(community.id),
      });
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
    onError: (error) => {
      logger.error("Failed to update community", error as Error);
      const message =
        error instanceof Error
          ? error.message
          : "Could not update the community. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

/** Delete a community (creator only, enforced by RLS). CASCADE removes its posts. */
export function useDeleteCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (communityId: string) => {
      const { error } = await communitiesTable()
        .delete()
        .eq("id", communityId);

      if (error) throw error;
      return communityId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      logger.error("Failed to delete community", error as Error);
      Alert.alert("Error", "Could not delete the community. Please try again.");
    },
  });
}
