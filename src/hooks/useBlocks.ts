import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export type BlockScope = "anonymous_only" | "profile_only";

export type BlockRecord = {
  userId: string;
  scope: BlockScope;
};

/**
 * Single source of truth for fetching this user's block records, in the
 * exact BlockRecord[] shape every consumer (isBlockedPost, isBlockedChat,
 * isBlockedDirectMessage, hasBlockForScope) expects. Exported so
 * _layout.tsx's cold-start prefetch can seed the ["blocks", userId] query
 * cache with data from this same function, instead of maintaining a second,
 * independent implementation that can silently drift out of sync with this
 * one — which is exactly how the Phase 7.2 blocks-cache-shape bug happened
 * (the prefetch wrote a flat string[] under this key, so every isBlockedX()
 * check silently evaluated to false whenever that write won the race
 * against this query's own fetch).
 *
 * Only fetches block_scope='profile_only' rows. anonymous_only rows are
 * deliberately excluded here, not just filtered after the fact: for an
 * anonymous_only block created via block_chat_partner (the only real
 * creation path — see supabase/migrations/...block_chat_partner), userId
 * is the anonymous chat partner's real UUID. Every existing consumer of
 * this array already compares that value against ids that are themselves
 * null-redacted server-side for anonymous chats (chats_view/
 * user_chats_summary/chat_messages_view already exclude blocked anonymous
 * rows entirely before the client ever sees them — see
 * 20260803000000_redact_anonymous_chat_initiator_id.sql's audit trail), so
 * fetching anonymous_only rows here served no remaining filtering purpose
 * and only exposed the partner's real identity to the client. profile_only
 * rows (all normal, non-anonymous blocking) are completely unaffected.
 */
export async function fetchBlockRecords(
  currentUserId: string | null | undefined,
): Promise<BlockRecord[]> {
  if (!currentUserId) return [];

  const [blockedByMe, blockedMe] = await Promise.all([
    supabase
      .from("blocks")
      .select("blocked_id, block_scope")
      .eq("blocker_id", currentUserId)
      .eq("block_scope", "profile_only"),
    supabase
      .from("blocks")
      .select("blocker_id, block_scope")
      .eq("blocked_id", currentUserId)
      .eq("block_scope", "profile_only"),
  ]);

  // Track unique userIds — every row reaching this point is already
  // profile_only (both by the .eq() filter above and the defensive
  // re-check below), so there's only one scope left to dedupe against.
  const seen = new Set<string>();
  const records: BlockRecord[] = [];

  // Defensive re-check, independent of the .eq() filter above: even if a
  // future change accidentally widened the query, a non-profile_only row
  // is still never turned into a BlockRecord the client can read.
  blockedByMe.data?.forEach((b) => {
    // Missing block_scope defaults to profile_only, same fallback this
    // function has always used — only an explicit "anonymous_only" is
    // excluded.
    const scope = (b.block_scope as BlockScope) ?? "profile_only";
    if (scope !== "profile_only") return;
    const key = b.blocked_id;
    if (!seen.has(key)) {
      seen.add(key);
      records.push({ userId: b.blocked_id, scope: "profile_only" });
    }
  });

  blockedMe.data?.forEach((b) => {
    const scope = (b.block_scope as BlockScope) ?? "profile_only";
    if (scope !== "profile_only") return;
    const key = b.blocker_id;
    if (!seen.has(key)) {
      seen.add(key);
      records.push({ userId: b.blocker_id, scope: "profile_only" });
    }
  });

  return records;
}

export function useBlocks() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  return useQuery<BlockRecord[]>({
    queryKey: ["blocks", currentUserId],
    enabled: Boolean(currentUserId),
    queryFn: () => fetchBlockRecords(currentUserId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

/**
 * Returns true if a post from `userId` with the given `isAnonymous` flag
 * should be hidden based on the current user's block records.
 */
export function isBlockedPost(
  blocks: BlockRecord[],
  userId: string | null | undefined,
  isAnonymous: boolean
): boolean {
  if (!userId) return false;
  return blocks.some(
    (b) =>
      b.userId === userId &&
      ((b.scope === "anonymous_only" && isAnonymous) ||
        (b.scope === "profile_only" && !isAnonymous))
  );
}

/**
 * Returns true if the specific scope block already exists for this user.
 * Used to conditionally show/hide the block button in the UI.
 */
export function hasBlockForScope(
  blocks: BlockRecord[],
  userId: string | null | undefined,
  scope: BlockScope
): boolean {
  if (!userId) return false;
  return blocks.some((b) => b.userId === userId && b.scope === scope);
}

/**
 * Returns true if a chat with `otherUserId` should be hidden. Scope must
 * match the chat's own anonymity: anonymous_only hides anonymous chats,
 * profile_only hides non-anonymous chats — mirrors posts_summary_view's
 * content-type matching so a block placed in one context never spills
 * into hiding unrelated content in the other.
 */
export function isBlockedChat(
  blocks: BlockRecord[],
  otherUserId: string | null | undefined,
  isAnonymous: boolean
): boolean {
  if (!otherUserId) return false;
  const requiredScope: BlockScope = isAnonymous
    ? "anonymous_only"
    : "profile_only";
  return blocks.some(
    (b) => b.userId === otherUserId && b.scope === requiredScope
  );
}
