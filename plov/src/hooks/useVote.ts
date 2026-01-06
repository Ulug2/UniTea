import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getUserVote, vote, getPostScore, getCommentScore } from '../utils/votes';

type VoteType = 'upvote' | 'downvote' | null;

interface UseVoteOptions {
    postId?: string;
    commentId?: string;
    onVoteSuccess?: () => void;
    // Optional: provide initial values to avoid fetching
    initialUserVote?: VoteType;
    initialScore?: number;
}

export function useVote({ 
    postId, 
    commentId, 
    onVoteSuccess,
    initialUserVote,
    initialScore,
}: UseVoteOptions) {
    const { session } = useAuth();
    const userId = session?.user?.id;
    const queryClient = useQueryClient();

    // Fetch current user's vote (skip if initial value provided)
    const { data: userVote, refetch: refetchUserVote } = useQuery<VoteType>({
        queryKey: ['user-vote', userId, postId, commentId],
        queryFn: async () => {
            if (!userId) return null;
            return await getUserVote(userId, postId, commentId);
        },
        enabled: !!userId && (!!postId || !!commentId) && initialUserVote === undefined,
        staleTime: 1000 * 30, // 30 seconds
        gcTime: 1000 * 60 * 5, // 5 minutes
        initialData: initialUserVote,
    });

    // Fetch score (skip if initial value provided)
    const { data: score, refetch: refetchScore } = useQuery<number>({
        queryKey: ['score', postId, commentId],
        queryFn: async () => {
            if (postId) {
                return await getPostScore(postId);
            } else if (commentId) {
                return await getCommentScore(commentId);
            }
            return 0;
        },
        enabled: (!!postId || !!commentId) && initialScore === undefined,
        staleTime: 1000 * 10, // 10 seconds
        gcTime: 1000 * 60 * 5, // 5 minutes
        initialData: initialScore,
    });

    // Vote mutation with optimistic updates
    const voteMutation = useMutation({
        mutationFn: async (voteType: 'upvote' | 'downvote') => {
            if (!userId) {
                throw new Error('You must be logged in to vote');
            }
            await vote(userId, voteType, postId, commentId);
        },
        onMutate: async (voteType: 'upvote' | 'downvote') => {
            // Cancel outgoing refetches to avoid overwriting optimistic update
            await queryClient.cancelQueries({ queryKey: ['user-vote', userId, postId, commentId] });
            await queryClient.cancelQueries({ queryKey: ['score', postId, commentId] });

            // Snapshot previous values
            const previousUserVote = queryClient.getQueryData<VoteType>(['user-vote', userId, postId, commentId]);
            const previousScore = queryClient.getQueryData<number>(['score', postId, commentId]) ?? 0;

            // Optimistically update user vote
            const newUserVote: VoteType =
                previousUserVote === voteType ? null : // Toggle off if same vote
                    voteType; // Set new vote

            queryClient.setQueryData<VoteType>(['user-vote', userId, postId, commentId], newUserVote);

            // Optimistically update score
            let newScore = previousScore;
            if (previousUserVote === voteType) {
                // Removing vote: subtract the vote
                newScore = previousScore - (voteType === 'upvote' ? 1 : -1);
            } else if (previousUserVote) {
                // Changing vote: remove old vote effect, add new vote effect
                newScore = previousScore - (previousUserVote === 'upvote' ? 1 : -1) + (voteType === 'upvote' ? 1 : -1);
            } else {
                // New vote: add the vote
                newScore = previousScore + (voteType === 'upvote' ? 1 : -1);
            }

            queryClient.setQueryData<number>(['score', postId, commentId], newScore);

            return { previousUserVote, previousScore };
        },
        onError: (err, voteType, context) => {
            // Rollback on error
            if (context) {
                queryClient.setQueryData(['user-vote', userId, postId, commentId], context.previousUserVote);
                queryClient.setQueryData(['score', postId, commentId], context.previousScore);
            }
        },
        onSettled: () => {
            // Silently refetch in background to sync with server (non-blocking)
            // The optimistic update already shows the correct UI, so this is just for consistency
            refetchUserVote();
            refetchScore();

            // Only invalidate if we need to ensure list consistency
            // Since we use optimistic updates, we can be less aggressive with invalidation
            // This prevents unnecessary full list refetches
            if (postId) {
                // Mark as stale but don't force immediate refetch
                queryClient.invalidateQueries({
                    queryKey: ['post', postId],
                    refetchType: 'none' // Don't refetch immediately, just mark stale
                });
            }
            if (commentId) {
                // Mark comments as stale but don't force immediate refetch
                queryClient.invalidateQueries({
                    queryKey: ['comments'],
                    refetchType: 'none' // Don't refetch immediately, just mark stale
                });
            }

            onVoteSuccess?.();
        },
    });

    const handleUpvote = () => {
        voteMutation.mutate('upvote');
    };

    const handleDownvote = () => {
        voteMutation.mutate('downvote');
    };

    return {
        userVote: userVote ?? null,
        score: score ?? 0,
        handleUpvote,
        handleDownvote,
        isVoting: voteMutation.isPending,
    };
}

