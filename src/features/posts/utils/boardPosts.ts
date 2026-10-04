/**
 * "Board" posts are the item-style posts shown in the Market tab — things
 * for sale (`market`) and Lost & Found (`lost_found`). They share one card,
 * one detail screen and one create form; this file is the single place the
 * differences between the two are decided.
 */
export const BOARD_POST_TYPES = ["market", "lost_found"] as const;

export type BoardPostType = (typeof BOARD_POST_TYPES)[number];

export function isBoardPostType(value: unknown): value is BoardPostType {
  return BOARD_POST_TYPES.includes(value as BoardPostType);
}

/** Live list query key for a board segment — also the invalidation target. */
export function boardPostsKey(
  postType: BoardPostType,
  universityId?: string | null,
) {
  return universityId === undefined
    ? (["posts", postType] as const)
    : (["posts", postType, universityId] as const);
}

/**
 * Lost & Found titles carry their category ("Lost: Keys"); market titles are
 * shown as written. Anything that isn't `market` keeps the Lost & Found
 * wording, matching how those posts have always been displayed.
 */
export function getBoardPostTitle(post: {
  post_type?: string | null;
  category?: string | null;
  title?: string | null;
}): string {
  const title = post.title?.trim() ?? "";
  if (post.post_type === "market") return title;
  const prefix = post.category === "lost" ? "Lost" : "Found";
  return title ? `${prefix}: ${title}` : prefix;
}

// Matches the `posts_price_check` constraint's integer column.
export const MAX_PRICE = 2_000_000_000;

/** "12 000 ₸", or null when the seller gave no price. */
export function formatPrice(price: number | null | undefined): string | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return null;
  }
  if (price === 0) return "Free";
  const grouped = String(Math.trunc(price)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} ₸`;
}

/** Keeps only digits as the user types, so the field can never hold a non-price. */
export function sanitizePriceInput(text: string): string {
  return text.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
}

/** Null for an empty field (no price) or anything out of range. */
export function parsePrice(text: string): number | null {
  const digits = sanitizePriceInput(text);
  if (!digits) return null;
  const value = Number(digits);
  return value <= MAX_PRICE ? value : null;
}
