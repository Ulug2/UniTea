import React from "react";
import PostListItem from "../../../components/PostListItem";
import type { PostsSummaryViewRow } from "../../../types/posts";

type PostHeaderCardProps = {
  post: PostsSummaryViewRow;
  commentCount: number;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onImagePress?: (uri: string) => void;
  isAdmin?: boolean;
  /** Fires once this card's avatar + all its images have loaded — see PostListItem's onImageLoad. */
  onImageLoad?: () => void;
  /** Skip the loading-spinner-overlay frame for this card's images — see ResponsiveImage's assumeCached. */
  imagesAssumeCached?: boolean;
};

export function PostHeaderCard({
  post,
  commentCount,
  isBookmarked,
  onToggleBookmark,
  onImagePress,
  isAdmin = false,
  onImageLoad,
  imagesAssumeCached,
}: PostHeaderCardProps) {
  return (
    <PostListItem
      postId={post.post_id}
      userId={post.user_id}
      content={post.content}
      title={post.title}
      imageUrl={post.image_url}
      imageUrls={post.image_urls ?? null}
      imageAspectRatio={post.image_aspect_ratio}
      category={post.category}
      location={post.location}
      postType={post.post_type}
      isAnonymous={post.is_anonymous}
      isEdited={post.is_edited}
      createdAt={post.created_at}
      updatedAt={post.updated_at}
      editedAt={post.edited_at}
      viewCount={post.view_count}
      username={post.username || "Unknown"}
      avatarUrl={post.avatar_url || null}
      universityDomain={post.university_domain}
      communityId={post.community_id}
      communityName={post.community_name}
      communityAvatarUrl={post.community_avatar_url}
      isVerified={post.is_verified || null}
      commentCount={commentCount}
      voteScore={post.vote_score ?? 0}
      userVote={post.user_vote}
      repostCount={post.repost_count || 0}
      repostedFromPostId={post.reposted_from_post_id}
      repostComment={post.repost_comment}
      originalContent={post.original_content}
      originalTitle={post.original_title}
      originalImageUrl={post.original_image_url}
      originalImageUrls={post.original_image_urls ?? null}
      originalImageAspectRatio={post.original_image_aspect_ratio}
      originalUserId={post.original_user_id}
      originalAuthorUsername={post.original_author_username}
      originalAuthorAvatar={post.original_author_avatar}
      originalIsAnonymous={post.original_is_anonymous}
      originalCreatedAt={post.original_created_at}
      isDetailedPost
      isBookmarked={isBookmarked}
      onBookmarkPress={onToggleBookmark}
      onImagePress={onImagePress}
      disableCommentInteraction
      isAdmin={isAdmin}
      onImageLoad={onImageLoad}
      imagesAssumeCached={imagesAssumeCached}
    />
  );
}
