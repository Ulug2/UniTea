import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import {
  getBoardPostTitle,
  isBoardPostType,
} from "../../posts/utils/boardPosts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `postId` route param a post screen passes when opening a chat. Anything
 * that isn't a single well-formed id is dropped, so a malformed link can never
 * make a message fail to send.
 */
export function parseContextPostId(
  param: string | string[] | undefined,
): string | null {
  return typeof param === "string" && UUID_RE.test(param) ? param : null;
}

/** The few post fields the in-chat post preview needs. */
export type ChatContextPost = {
  post_id: string;
  title: string | null;
  content: string | null;
  post_type: string | null;
  category: string | null;
  has_image: boolean;
};

export type ChatContextPostPreview = {
  /** "Post", "Lost & Found" or "Market". */
  label: string;
  text: string;
};

export const chatContextPostKey = (postId: string | null | undefined) =>
  ["chat-context-post", postId] as const;

/**
 * Resolves to null when the reader can't see the post (deleted, banned or
 * blocked author) — the preview then reads "Post unavailable".
 */
async function fetchChatContextPost(
  postId: string,
): Promise<ChatContextPost | null> {
  const { data, error } = await supabase
    .from("posts_summary_view")
    .select(
      "post_id, title, content, post_type, category, image_url, image_urls, is_deleted, is_banned, is_author_blocked_by_viewer",
    )
    .eq("post_id", postId)
    .maybeSingle();
  if (error) throw error;
  const row = data as any;
  if (
    !row ||
    row.is_deleted === true ||
    row.is_banned === true ||
    row.is_author_blocked_by_viewer === true
  ) {
    return null;
  }
  return {
    post_id: row.post_id,
    title: row.title ?? null,
    content: row.content ?? null,
    post_type: row.post_type ?? null,
    category: row.category ?? null,
    has_image:
      !!row.image_url ||
      (Array.isArray(row.image_urls) && row.image_urls.length > 0),
  };
}

export function useChatContextPost(postId: string | null | undefined) {
  return useQuery({
    queryKey: chatContextPostKey(postId),
    queryFn: () => fetchChatContextPost(postId as string),
    enabled: !!postId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

/** Detail screen for a post, by its type. */
export function getContextPostRoute(post: ChatContextPost): string {
  return isBoardPostType(post.post_type)
    ? `/lostfoundpost/${post.post_id}`
    : `/post/${post.post_id}`;
}

/**
 * What the preview shows. Images are never rendered — a post with images
 * gets an "[image]" placeholder after its text.
 */
export function getChatContextPostPreview(
  post: ChatContextPost | null | undefined,
  isLoading: boolean,
): ChatContextPostPreview {
  if (post === null) return { label: "Post", text: "Post unavailable" };
  if (!post) return { label: "Post", text: isLoading ? "Loading…" : "Tap to open" };

  const isBoard = isBoardPostType(post.post_type);
  const title = isBoard ? getBoardPostTitle(post) : (post.title?.trim() ?? "");
  const parts = [title, post.content?.trim() ?? ""].filter(Boolean);
  if (post.has_image) parts.push("[image]");

  return {
    label:
      post.post_type === "market"
        ? "Market"
        : isBoard
          ? "Lost & Found"
          : "Post",
    text: parts.join("\n"),
  };
}
