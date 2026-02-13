import React from "react";
import PostListItem from "../../../components/PostListItem";
import type { PostsSummaryViewRow } from "../../../types/posts";
import type { Database } from "../../../types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type PostHeaderCardProps = {
  post: PostsSummaryViewRow;
  postUser: Profile | null;
  commentCount: number;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
};

export function PostHeaderCard({
  post,
  postUser,
  commentCount,
  isBookmarked,
  onToggleBookmark,
}: PostHeaderCardProps) {
  return (
    <PostListItem
      postId={post.post_id}
      userId={post.user_id}
      content={post.content}
      imageUrl={post.image_url}
      category={post.category}
      location={post.location}
      postType={post.post_type}
      isAnonymous={post.is_anonymous}
      isEdited={post.is_edited}
      createdAt={post.created_at}
      updatedAt={post.updated_at}
      editedAt={post.edited_at}
      viewCount={post.view_count}
      username={post.username || postUser?.username || "Unknown"}
      avatarUrl={post.avatar_url || postUser?.avatar_url || null}
      isVerified={post.is_verified || postUser?.is_verified || null}
      commentCount={commentCount}
      voteScore={post.vote_score ?? 0}
      repostCount={post.repost_count || 0}
      repostedFromPostId={post.reposted_from_post_id}
      repostComment={post.repost_comment}
      originalContent={post.original_content}
      originalUserId={post.original_user_id}
      originalAuthorUsername={post.original_author_username}
      originalAuthorAvatar={post.original_author_avatar}
      originalIsAnonymous={post.original_is_anonymous}
      originalCreatedAt={post.original_created_at}
      isDetailedPost
      isBookmarked={isBookmarked}
      onBookmarkPress={onToggleBookmark}
      disableCommentInteraction
    />
  );
}

