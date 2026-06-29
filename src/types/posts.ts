// Shared TypeScript types for post-related views.
// Centralizes the shape of `posts_summary_view` rows so we don't duplicate it
// across feed, profile, lost & found, and detail screens.

export type PostsSummaryViewRow = {
  post_id: string;
  // Null for other users' anonymous posts (C1 redaction).
  user_id: string | null;
  content: string;
  title: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  image_aspect_ratio?: number | null;
  category: string | null;
  location: string | null;
  post_type: string;
  university_id: string;
  university_domain: string;
  community_id: string | null;
  community_name: string | null;
  community_avatar_url: string | null;
  is_anonymous: boolean | null;
  is_deleted: boolean | null;
  is_edited: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  view_count: number | null;
  // Null for other users' anonymous posts (C1 redaction).
  username: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  is_banned: boolean | null;
  comment_count: number;
  vote_score: number;
  user_vote: "upvote" | "downvote" | null;
  reposted_from_post_id: string | null;
  repost_comment: string | null;
  repost_count: number;
  hot_score: number;
  original_post_id?: string | null;
  original_title?: string | null;
  original_content?: string | null;
  original_user_id?: string | null;
  original_author_username?: string | null;
  original_author_avatar?: string | null;
  original_image_url?: string | null;
  original_image_urls?: string[] | null;
  original_image_aspect_ratio?: number | null;
  original_is_anonymous?: boolean | null;
  original_created_at?: string | null;
  // Server-computed block flags (see migration 20260628000004).
  // True when the calling user has a matching block against the post author,
  // evaluated against the real user_id before C1 redaction.
  is_author_blocked_by_viewer?: boolean;
  is_original_author_blocked_by_viewer?: boolean;
};

