import type { PostsSummaryViewRow } from "../../../types/posts";

/**
 * Sample posts_summary_view rows for testing the post card preview layout
 * without signing in. Only served in __DEV__ builds (see
 * PostCardPreviewScreen). They are plainly labelled sample content, never
 * real users or posts, and their ids use a reserved all-zero prefix that no
 * real post has.
 */
export const PREVIEW_FIXTURE_NAMES = [
  "text",
  "anonymous",
  "anonymous-sdu",
  "long",
] as const;
export type PreviewFixtureName = (typeof PREVIEW_FIXTURE_NAMES)[number];

const HOUR_MS = 60 * 60 * 1000;

function baseRow(
  postId: string,
  createdAt: string,
): PostsSummaryViewRow {
  return {
    post_id: postId,
    user_id: "00000000-0000-4000-8000-0000000000a1",
    content: "",
    title: null,
    image_url: null,
    image_urls: null,
    image_aspect_ratio: null,
    category: null,
    location: null,
    post_type: "feed",
    university_id: "00000000-0000-4000-8000-0000000000b1",
    // A real campus domain so the card shows that campus's actual branding
    // (UNIVERSITY_BRANDING) exactly as the app does.
    university_domain: "nu.edu.kz",
    community_id: null,
    community_name: null,
    community_avatar_url: null,
    is_anonymous: false,
    is_deleted: false,
    is_edited: false,
    created_at: createdAt,
    updated_at: createdAt,
    edited_at: null,
    view_count: 0,
    username: "sample_student",
    avatar_url: null,
    is_verified: false,
    is_banned: false,
    comment_count: 0,
    vote_score: 0,
    user_vote: null,
    reposted_from_post_id: null,
    repost_comment: null,
    repost_count: 0,
    hot_score: 0,
    is_author_blocked_by_viewer: false,
    is_original_author_blocked_by_viewer: false,
  };
}

export function getPreviewFixture(
  name: string | null | undefined,
  now: number = Date.now(),
): PostsSummaryViewRow | null {
  switch (name) {
    case "text":
      return {
        ...baseRow(
          "00000000-0000-4000-8000-000000000001",
          new Date(now - 2 * HOUR_MS).toISOString(),
        ),
        title: "Sample post title",
        content:
          "Sample post content for testing the preview layout. This is fixture text, not a real post.",
        comment_count: 4,
        vote_score: 12,
        repost_count: 1,
      };
    case "anonymous":
      return {
        ...baseRow(
          "00000000-0000-4000-8000-000000000002",
          new Date(now - 5 * HOUR_MS).toISOString(),
        ),
        // Mirrors the view's anonymous redaction for other viewers.
        user_id: null,
        username: null,
        is_anonymous: true,
        content:
          "Sample anonymous post for testing the preview layout. Fixture text, not a real post.",
        comment_count: 9,
        vote_score: 27,
      };
    case "anonymous-sdu":
      return {
        ...baseRow(
          "00000000-0000-4000-8000-000000000004",
          new Date(now - 3 * HOUR_MS).toISOString(),
        ),
        university_id: "00000000-0000-4000-8000-0000000000b2",
        university_domain: "sdu.edu.kz",
        user_id: null,
        username: null,
        is_anonymous: true,
        content:
          "Sample anonymous SDU post for testing the preview layout. Fixture text, not a real post.",
        comment_count: 6,
        vote_score: 18,
      };
    case "long":
      return {
        ...baseRow(
          "00000000-0000-4000-8000-000000000003",
          new Date(now - 26 * HOUR_MS).toISOString(),
        ),
        content: Array.from(
          { length: 6 },
          (_, i) =>
            `Sample paragraph ${i + 1} of fixture text used to test the "read more" truncation in the preview card.`,
        ).join("\n"),
        comment_count: 2,
        vote_score: 5,
      };
    default:
      return null;
  }
}
