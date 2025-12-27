// src/utils/votes.ts
import { supabase } from '../lib/supabase';
import { Tables, TablesInsert } from '../types/database.types';

type Vote = Tables<'votes'>;

const calculateScore = (votes: Pick<Vote, 'vote_type'>[]): number =>
    votes.reduce((sum, v) => {
        if (v.vote_type === 'upvote') return sum + 1;
        if (v.vote_type === 'downvote') return sum - 1;
        return sum;
    }, 0);

/**
 * Get score for a post (upvotes - downvotes)
 */
export const getPostScore = async (postId: string): Promise<number> => {
    const { data, error } = await supabase
        .from('votes')
        .select('vote_type')
        .eq('post_id', postId);

    if (error || !data) {
        console.error('[getPostScore] error', error);
        return 0;
    }

    return calculateScore(data as Vote[]);
};

/**
 * Get score for a comment (upvotes - downvotes)
 */
export const getCommentScore = async (commentId: string): Promise<number> => {
    const { data, error } = await supabase
        .from('votes')
        .select('vote_type')
        .eq('comment_id', commentId);

    if (error || !data) {
        console.error('[getCommentScore] error', error);
        return 0;
    }

    return calculateScore(data as Vote[]);
};

/**
 * Get the current user's vote (if any) on a post or comment
 */
export const getUserVote = async (
    userId: string,
    postId?: string,
    commentId?: string
): Promise<'upvote' | 'downvote' | null> => {
    const targetColumn = postId ? 'post_id' : 'comment_id';
    const targetId = postId ?? commentId;

    if (!targetId) return null;

    const { data, error } = await supabase
        .from('votes')
        .select('vote_type, id')
        .eq('user_id', userId)
        .eq(targetColumn, targetId)
        .maybeSingle();

    // PGRST116 = "Results contain 0 rows", i.e. no vote yet → not an error for us
    if (error && error.code !== 'PGRST116') {
        console.error('[getUserVote] error', error);
        return null;
    }

    return (data?.vote_type as 'upvote' | 'downvote') ?? null;
};

/**
 * Get the current user's vote ID (if any) on a post or comment
 */
export const getUserVoteId = async (
    userId: string,
    postId?: string,
    commentId?: string
): Promise<string | null> => {
    const targetColumn = postId ? 'post_id' : 'comment_id';
    const targetId = postId ?? commentId;

    if (!targetId) return null;

    const { data, error } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', userId)
        .eq(targetColumn, targetId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('[getUserVoteId] error', error);
        return null;
    }

    return data?.id ?? null;
};

/**
 * Vote on a post or comment (upvote or downvote)
 * If user already voted the same way, removes the vote
 * If user voted differently, updates the vote
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

    // Check if user already voted
    const existingVoteId = await getUserVoteId(userId, postId, commentId);
    const existingVoteType = await getUserVote(userId, postId, commentId);

    if (existingVoteId && existingVoteType === voteType) {
        // User clicked the same vote again - remove the vote
        const { error } = await supabase
            .from('votes')
            .delete()
            .eq('id', existingVoteId);

        if (error) {
            console.error('[vote] delete error', error);
            throw error;
        }
    } else if (existingVoteId) {
        // User changed their vote - update it
        const { error } = await supabase
            .from('votes')
            .update({ vote_type: voteType })
            .eq('id', existingVoteId);

        if (error) {
            console.error('[vote] update error', error);
            throw error;
        }
    } else {
        // New vote - insert it
        const voteData: TablesInsert<'votes'> = {
            user_id: userId,
            vote_type: voteType,
            ...(postId ? { post_id: postId } : { comment_id: commentId }),
        };

        const { error } = await supabase
            .from('votes')
            .insert(voteData);

        if (error) {
            console.error('[vote] insert error', error);
            throw error;
        }
    }
};