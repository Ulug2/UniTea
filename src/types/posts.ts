// Shared TypeScript types for post-related views.
// Centralizes the shape of `posts_summary_view` rows so we don't duplicate it
// across feed, profile, lost & found, and detail screens.

export type PostsSummaryViewRow = {
  post_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  category: string | null;
  location: string | null;
  post_type: string;
  is_anonymous: boolean | null;
  is_deleted: boolean | null;
  is_edited: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  view_count: number | null;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
  is_banned: boolean | null;
  comment_count: number;
  vote_score: number;
  user_vote: "upvote" | "downvote" | null;
  reposted_from_post_id: string | null;
  repost_comment: string | null;
  repost_count: number;
  original_post_id?: string | null;
  original_content?: string | null;
  original_user_id?: string | null;
  original_author_username?: string | null;
  original_author_avatar?: string | null;
  original_is_anonymous?: boolean | null;
  original_created_at?: string | null;
};

