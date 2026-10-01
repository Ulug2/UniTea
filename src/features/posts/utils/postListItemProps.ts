import type { PostListItemProps } from "../../../components/PostListItem";
import type { PostsSummaryViewRow } from "../../../types/posts";

/**
 * Maps a posts_summary_view row to PostListItem's post-data props. Shared by
 * Campus Feed, Community View and the web post card preview so every list
 * rendering of a post reads the view the same way; screen-specific props
 * (gallery, admin, image-load callbacks, readOnly) are passed alongside.
 */
export function toPostListItemProps(row: PostsSummaryViewRow) {
  return {
    postId: row.post_id,
    userId: row.user_id,
    content: row.content,
    title: row.title,
    imageUrl: row.image_url,
    imageUrls: row.image_urls ?? null,
    imageAspectRatio: row.image_aspect_ratio,
    category: row.category,
    location: row.location,
    postType: row.post_type,
    isAnonymous: row.is_anonymous,
    isEdited: row.is_edited,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    viewCount: row.view_count,
    username: row.username,
    avatarUrl: row.avatar_url,
    universityDomain: row.university_domain,
    communityId: row.community_id,
    communityName: row.community_name,
    communityAvatarUrl: row.community_avatar_url,
    isVerified: row.is_verified,
    commentCount: row.comment_count,
    voteScore: row.vote_score,
    userVote: row.user_vote,
    repostCount: row.repost_count,
    repostedFromPostId: row.reposted_from_post_id,
    repostComment: row.repost_comment,
    originalContent: row.original_content,
    originalTitle: row.original_title,
    originalImageUrl: row.original_image_url,
    originalImageUrls: row.original_image_urls ?? null,
    originalImageAspectRatio: row.original_image_aspect_ratio,
    originalUserId: row.original_user_id,
    originalAuthorUsername: row.original_author_username,
    originalAuthorAvatar: row.original_author_avatar,
    originalIsAnonymous: row.original_is_anonymous,
    originalCreatedAt: row.original_created_at,
  } satisfies PostListItemProps;
}
