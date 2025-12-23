// src/utils/votes.ts
import { supabase } from '../lib/supabase';
import { Tables } from '../types/database.types';

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
        .select('vote_type')
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