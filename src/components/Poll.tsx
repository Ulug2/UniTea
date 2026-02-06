import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

type PollProps = {
  postId: string;
};

type PollOption = {
  id: string;
  option_text: string;
  position: number;
};

type PollVote = {
  id: string;
  option_id: string;
  user_id: string;
};

type PollData = {
  id: string;
  expires_at: string | null;
  allow_multiple: boolean;
  poll_options: PollOption[];
  poll_votes: PollVote[];
};

const Poll: React.FC<PollProps> = ({ postId }) => {
  const { theme } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id ?? null;

  const {
    data: poll,
    isLoading,
  } = useQuery<PollData | null>({
    queryKey: ["poll", postId, currentUserId],
    enabled: !!postId && !postId.startsWith("temp-"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("polls")
        .select(
          `
            id,
            expires_at,
            allow_multiple,
            poll_options (
              id,
              option_text,
              position
            ),
            poll_votes (
              id,
              option_id,
              user_id
            )
          `
        )
        .eq("post_id", postId)
        .maybeSingle();

      if (error) {
        console.error("[Poll] fetch error", error);
        return null;
      }

      if (!data) return null;

      return data as PollData;
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  const { options, totalVotes, votesByOptionId, userSelectedOptionId, isExpired } =
    useMemo(() => {
      if (!poll) {
        return {
          options: [] as PollOption[],
          totalVotes: 0,
          votesByOptionId: new Map<string, number>(),
          userSelectedOptionId: null as string | null,
          isExpired: false,
        };
      }

      const sortedOptions = [...(poll.poll_options || [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0)
      );

      const votes = poll.poll_votes || [];
      const votesMap = new Map<string, number>();
      let userSelection: string | null = null;

      votes.forEach((vote) => {
        const current = votesMap.get(vote.option_id) || 0;
        votesMap.set(vote.option_id, current + 1);
        if (vote.user_id === currentUserId) {
          userSelection = vote.option_id;
        }
      });

      const total = votes.length;
      const expired =
        poll.expires_at != null &&
        new Date(poll.expires_at).getTime() < Date.now();

      return {
        options: sortedOptions,
        totalVotes: total,
        votesByOptionId: votesMap,
        userSelectedOptionId: userSelection,
        isExpired: expired,
      };
    }, [poll, currentUserId]);

  const voteMutation = useMutation({
    mutationFn: async (optionId: string) => {
      if (!poll || !currentUserId) {
        throw new Error("Missing poll or user");
      }

      const existingUserVotes = poll.poll_votes.filter(
        (v) => v.user_id === currentUserId
      );
      const alreadySelected = existingUserVotes.some(
        (v) => v.option_id === optionId
      );

      // Single-choice behavior (ignore allow_multiple for now)
      if (alreadySelected) {
        // Unvote: remove existing vote for this option
        const toDelete = existingUserVotes
          .filter((v) => v.option_id === optionId)
          .map((v) => v.id);
        if (toDelete.length === 0) return;

        const { error } = await supabase
          .from("poll_votes")
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      } else {
        // Change / add vote: remove all user votes for this poll, then insert new
        const allUserVoteIds = existingUserVotes.map((v) => v.id);
        if (allUserVoteIds.length > 0) {
          const { error: delError } = await supabase
            .from("poll_votes")
            .delete()
            .in("id", allUserVoteIds);
          if (delError) throw delError;
        }

        const { error: insError } = await supabase.from("poll_votes").insert({
          poll_id: poll.id,
          option_id: optionId,
          user_id: currentUserId,
        });
        if (insError) throw insError;
      }
    },
    onMutate: async (optionId: string) => {
      await queryClient.cancelQueries({ queryKey: ["poll", postId, currentUserId] });

      const previousPoll = queryClient.getQueryData<PollData | null>([
        "poll",
        postId,
        currentUserId,
      ]);

      if (!previousPoll || !currentUserId) {
        return { previousPoll };
      }

      const existingUserVotes = previousPoll.poll_votes.filter(
        (v) => v.user_id === currentUserId
      );
      const alreadySelected = existingUserVotes.some(
        (v) => v.option_id === optionId
      );

      let nextVotes: PollVote[];

      if (alreadySelected) {
        // Optimistically remove vote for this option
        nextVotes = previousPoll.poll_votes.filter(
          (v) => !(v.user_id === currentUserId && v.option_id === optionId)
        );
      } else {
        // Optimistically replace any existing vote with the new one
        nextVotes = previousPoll.poll_votes.filter(
          (v) => v.user_id !== currentUserId
        );
        nextVotes = [
          ...nextVotes,
          {
            id: `temp-${Date.now()}`,
            option_id: optionId,
            user_id: currentUserId,
          },
        ];
      }

      queryClient.setQueryData<PollData | null>(
        ["poll", postId, currentUserId],
        {
          ...previousPoll,
          poll_votes: nextVotes,
        }
      );

      return { previousPoll };
    },
    onError: (_error, _optionId, context) => {
      if (context?.previousPoll) {
        queryClient.setQueryData(
          ["poll", postId, currentUserId],
          context.previousPoll
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["poll", postId, currentUserId] });
    },
  });

  if (isLoading || !poll || options.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {options.map((option) => {
        const optionVotes = votesByOptionId.get(option.id) || 0;
        const percentage =
          totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
        const isSelected = userSelectedOptionId === option.id;

        return (
          <Pressable
            key={option.id}
            style={[
              styles.optionRow,
              {
                backgroundColor: isSelected
                  ? theme.primary + "22"
                  : theme.background,
                borderColor: isSelected ? theme.primary : theme.border,
              },
            ]}
            disabled={isExpired || !currentUserId || voteMutation.isPending}
            onPress={() => voteMutation.mutate(option.id)}
          >
            <View style={styles.optionLeft}>
              <MaterialCommunityIcons
                name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                size={20}
                color={isSelected ? theme.primary : theme.secondaryText}
              />
              <Text
                style={[
                  styles.optionText,
                  { color: theme.text },
                ]}
              >
                {option.option_text}
              </Text>
            </View>
            <View style={styles.optionRight}>
              <Text
                style={[
                  styles.percentageText,
                  { color: theme.secondaryText },
                ]}
              >
                {percentage}%
              </Text>
              <Text
                style={[
                  styles.votesText,
                  { color: theme.secondaryText },
                ]}
              >
                {optionVotes}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: theme.secondaryText }]}>
          {totalVotes === 1 ? "1 vote" : `${totalVotes} votes`}
        </Text>
        {isExpired && (
          <Text style={[styles.footerText, { color: theme.secondaryText }]}>
            Poll closed
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  optionText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    flexShrink: 1,
  },
  optionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  percentageText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  votesText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
});

export default Poll;

