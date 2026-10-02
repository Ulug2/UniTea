/**
 * Picks the best anonymous campus posts for Instagram captures of the web
 * post card preview (src/app/preview/post-card.tsx). Pure — no I/O — so the
 * rules are unit-tested (src/__tests__/scripts/selectPosts.test.ts).
 */

const CAMPUSES = {
  nu: { domain: "nu.edu.kz", label: "Nazarbayev" },
  sdu: { domain: "sdu.edu.kz", label: "Suleiman Demirel" },
};

// Mirrors PostListItem's READ_MORE_CHAR_THRESHOLD / READ_MORE_NEWLINE_THRESHOLD
// and its 3-line title clamp: a post past these shows "... read more" or a
// clipped title on the card, which doesn't make a clean capture.
const MAX_CONTENT_CHARS = 180;
const MAX_NEWLINES = 2;
const MIN_CONTENT_CHARS = 25;
const MAX_TITLE_CHARS = 80;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Captures should feel current: only posts from the last two weeks. */
const DEFAULT_MAX_AGE_DAYS = 14;

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasImages(row) {
  return (
    Boolean(row.image_url) ||
    (Array.isArray(row.image_urls) && row.image_urls.length > 0)
  );
}

function isUsed(row, usedEntries) {
  const content = normalize(row.content);
  return usedEntries.some(
    (entry) =>
      (entry.post_id && entry.post_id === row.post_id) ||
      (entry.content_prefix &&
        content.startsWith(normalize(entry.content_prefix))),
  );
}

/** Why a row can't be used, or null when it is a candidate. */
function rejectionReason(
  row,
  { domain, usedEntries, maxAgeDays = DEFAULT_MAX_AGE_DAYS, now = Date.now() },
) {
  const content = String(row.content ?? "").trim();
  const createdAt = Date.parse(row.created_at ?? "");
  if (row.university_domain !== domain) return "other campus";
  if (row.post_type !== "feed") return "not a feed post";
  if (row.is_anonymous !== true) return "not anonymous";
  if (row.community_id) return "community post";
  if (row.reposted_from_post_id) return "repost";
  if (row.is_deleted === true || row.is_banned === true) return "removed";
  if (row.is_author_blocked_by_viewer === true) return "blocked author";
  if (!(createdAt >= now - maxAgeDays * DAY_MS)) return "too old";
  if (hasImages(row)) return "has images";
  if (content.length < MIN_CONTENT_CHARS) return "too short";
  if (content.length > MAX_CONTENT_CHARS) return "too long for the card";
  if ((content.match(/\n/g) ?? []).length > MAX_NEWLINES) return "too many lines";
  if (String(row.title ?? "").trim().length > MAX_TITLE_CHARS) return "title too long";
  if (isUsed(row, usedEntries)) return "already used";
  return null;
}

/** Best first: score, then comments, then newest. */
function compareRows(a, b) {
  return (
    (b.vote_score ?? 0) - (a.vote_score ?? 0) ||
    (b.comment_count ?? 0) - (a.comment_count ?? 0) ||
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
  );
}

function selectPosts(
  rows,
  { campus, count, usedEntries = [], maxAgeDays = DEFAULT_MAX_AGE_DAYS, now = Date.now() },
) {
  const config = CAMPUSES[campus];
  if (!config) throw new Error(`Unknown campus "${campus}" (use nu or sdu)`);
  const rules = { domain: config.domain, usedEntries, maxAgeDays, now };
  return rows
    .filter((row) => rejectionReason(row, rules) === null)
    .sort(compareRows)
    .slice(0, count);
}

module.exports = { CAMPUSES, DEFAULT_MAX_AGE_DAYS, rejectionReason, selectPosts };
