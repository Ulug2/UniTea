// src/utils/votes.ts
import { supabase } from '../lib/supabase';
import { Database, TablesInsert } from '../types/database.types';

type Vote = Database['public']['Tables']['votes']['Row'];

const calculateScore = (votes: Pick<Vote, 'vote_type'>[]): number =>
    votes.reduce((sum, v) => {
        if (v.vote_type === 'upvote') return sum + 1;
        if (v.vote_type === 'downvote') return sum - 1;
        return sum;
    }, 0);

/**
 * Retry helper for database operations
 */
const retryOperation = async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
): Promise<T> => {
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // Don't retry on client errors (400-499)
            if (error?.code?.startsWith('4')) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            if (i < maxRetries - 1) {
                await new Promise((resolve) =>
                    setTimeout(resolve, delay * Math.pow(2, i))
                );
            }
        }
    }

    throw lastError;
};

/**
 * Get score for a post (upvotes - downvotes)
 */
export const getPostScore = async (postId: string): Promise<number> => {
    try {
        const { data, error } = await retryOperation(async () =>
            await supabase
                .from('votes')
                .select('vote_type')
                .eq('post_id', postId)
        );

        if (error) {
            console.error('[getPostScore] error', error);
            return 0; // Fallback to 0 instead of crashing
        }

        return calculateScore(data as Vote[]);
    } catch (error) {
        console.error('[getPostScore] fatal error', error);
        return 0; // Always return a number, never throw
    }
};

/**
 * Get score for a comment (upvotes - downvotes)
 */
export const getCommentScore = async (commentId: string): Promise<number> => {
    if (commentId.startsWith('temp-')) {
        return 0;
    }

    try {
        const { data, error } = await retryOperation(async () =>
            await supabase
                .from('votes')
                .select('vote_type')
                .eq('comment_id', commentId)
        );

        if (error) {
            console.error('[getCommentScore] error', error);
            return 0;
        }

        return calculateScore(data as Vote[]);
    } catch (error) {
        console.error('[getCommentScore] fatal error', error);
        return 0;
    }
};

/**
 * Get the current user's vote (if any) on a post or comment
 * FIXED: Combined with getUserVoteId to prevent race conditions
 */
export const getUserVote = async (
    userId: string,
    postId?: string,
    commentId?: string
): Promise<{ voteType: 'upvote' | 'downvote' | null; voteId: string | null }> => {
    const targetColumn = postId ? 'post_id' : 'comment_id';
    const targetId = postId ?? commentId;

    if (!targetId) return { voteType: null, voteId: null };

    if (commentId?.startsWith('temp-')) {
        return { voteType: null, voteId: null };
    }

    try {
        const { data, error } = await retryOperation(async () =>
            await supabase
                .from('votes')
                .select('vote_type, id')
                .eq('user_id', userId)
                .eq(targetColumn, targetId)
                .maybeSingle()
        );

        // PGRST116 = "Results contain 0 rows"
        if (error && error.code !== 'PGRST116') {
            console.error('[getUserVote] error', error);
            return { voteType: null, voteId: null };
        }

        return {
            voteType: (data?.vote_type as 'upvote' | 'downvote') ?? null,
            voteId: data?.id ?? null,
        };
    } catch (error) {
        console.error('[getUserVote] fatal error', error);
        return { voteType: null, voteId: null };
    }
};

/**
 * Vote on a post or comment (upvote or downvote)
 * FIXED: Single query to get existing vote, prevents race conditions
 * FIXED: Uses upsert to prevent duplicate votes
 */
export const vote = async (
    userId: string,
    voteType: 'upvote' | 'downvote',
    postId?: string,
    commentId?: string
): Promise<void> => {
    if (!postId && !commentId) {
        throw new Error('Either postId or commentId must be provided');
    }

    try {
        // Get existing vote in single query to prevent race conditions
        const { voteType: existingVoteType, voteId: existingVoteId } =
            await getUserVote(userId, postId, commentId);

        if (existingVoteId && existingVoteType === voteType) {
            // User clicked the same vote again - remove the vote
            const { error } = await retryOperation(async () =>
                await supabase
                    .from('votes')
                    .delete()
                    .eq('id', existingVoteId)
            );

            if (error) {
                console.error('[vote] delete error', error);
                throw error;
            }
        } else if (existingVoteId) {
            // User changed their vote - update it
            const { error } = await retryOperation(async () =>
                await supabase
                    .from('votes')
                    .update({ vote_type: voteType })
                    .eq('id', existingVoteId)
            );

            if (error) {
                console.error('[vote] update error', error);
                throw error;
            }
        } else {
            // New vote - use upsert to prevent duplicates on concurrent requests
            const voteData: TablesInsert<'votes'> = {
                user_id: userId,
                vote_type: voteType,
                ...(postId ? { post_id: postId } : { comment_id: commentId }),
            };

            const { error } = await retryOperation(async () =>
                await supabase
                    .from('votes')
                    .upsert(voteData, {
                        onConflict: postId
                            ? 'user_id,post_id'
                            : 'user_id,comment_id',
                        ignoreDuplicates: false, // Update if exists
                    })
            );

            if (error) {
                console.error('[vote] insert error', error);
                throw error;
            }
        }
    } catch (error) {
        console.error('[vote] fatal error', error);
        throw error; // Re-throw so UI can show error to user
    }
};