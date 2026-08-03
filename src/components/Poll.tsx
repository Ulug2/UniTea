import React, { useEffect, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { savePollToStorage } from "../utils/feedPersistence";
import { usePoll, type PollOption, type PollVote, type PollData } from "../hooks/usePoll";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

type PollProps = {
  postId: string;
};

const Poll: React.FC<PollProps> = ({ postId }) => {
  const { theme } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id ?? null;

  const { data: poll, isLoading } = usePoll(postId, currentUserId);

  // Persist after every successful fetch so the next cold start can seed
  // this exact poll's cache (see feedPersistence.ts's
  // seedPollCachesForPosts, called from _layout.tsx for the Campus Feed's
  // seeded posts) — without this, a post's own row renders immediately from
  // the feed seed, but its poll still popped in only once this component's
  // own query resolved fresh, every cold start.
  useEffect(() => {
    if (poll) {
      savePollToStorage(postId, poll);
    }
  }, [poll, postId]);

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

      // Single-choice behavior (ignore allow_multiple for now). Each branch
      // is a single atomic statement — no more delete-then-insert pair —
      // backed by the poll_votes_user_poll_unique constraint (one vote per
      // user per poll), so a retry, a fast double-tap, or a race from a
      // second device can never leave more than one row for this user,
      // regardless of timing. Mirrors src/utils/votes.ts's post/comment
      // vote pattern.
      if (alreadySelected) {
        // Unvote: remove this user's vote for this poll. Targeted by
        // (poll_id, user_id) rather than a client-held row id — the unique
        // constraint guarantees at most one matching row.
        const { error } = await supabase
          .from("poll_votes")
          .delete()
          .eq("poll_id", poll.id)
          .eq("user_id", currentUserId);
        if (error) throw error;
      } else {
        // Vote / change vote: a single upsert keyed on (user_id, poll_id).
        // On conflict, Postgres updates option_id on the existing row
        // instead of creating a second one.
        const { error } = await supabase.from("poll_votes").upsert(
          {
            poll_id: poll.id,
            option_id: optionId,
            user_id: currentUserId,
          },
          { onConflict: "user_id,poll_id", ignoreDuplicates: false },
        );
        if (error) throw error;
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
                size={moderateScale(20)}
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
    marginTop: verticalScale(8),
    padding: moderateScale(10),
    borderRadius: moderateScale(12),
    borderWidth: 1,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(10),
    borderRadius: moderateScale(999),
    borderWidth: 1,
    marginBottom: verticalScale(6),
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: moderateScale(8),
  },
  optionText: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
    flexShrink: 1,
  },
  optionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(8),
  },
  percentageText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
  votesText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: verticalScale(4),
  },
  footerText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
  },
});

export default Poll;

