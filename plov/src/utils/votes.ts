import votes from '../../assets/data/votes.json';

export const getPostScore = (postId: string): number => {
    const upvotes = votes.filter(v => v.post_id === postId && v.vote_type === 'upvote').length;
    const downvotes = votes.filter(v => v.post_id === postId && v.vote_type === 'downvote').length;
    return upvotes - downvotes;
};

export const getCommentScore = (commentId: string): number => {
    const upvotes = votes.filter(v => v.comment_id === commentId && v.vote_type === 'upvote').length;
    const downvotes = votes.filter(v => v.comment_id === commentId && v.vote_type === 'downvote').length;
    return upvotes - downvotes;
};

export const getUserVote = (userId: string, postId?: string, commentId?: string): 'upvote' | 'downvote' | null => {
    const vote = votes.find(v =>
        v.user_id === userId &&
        (postId ? v.post_id === postId : v.comment_id === commentId)
    );
    return vote ? (vote.vote_type as 'upvote' | 'downvote') : null;
};

