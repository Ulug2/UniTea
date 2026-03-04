import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export type BlockScope = "anonymous_only" | "profile_only";

export type BlockRecord = {
  userId: string;
  scope: BlockScope;
};

export function useBlocks() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  return useQuery<BlockRecord[]>({
    queryKey: ["blocks", currentUserId],
    enabled: Boolean(currentUserId),
    queryFn: async () => {
      if (!currentUserId) return [];

      const [blockedByMe, blockedMe] = await Promise.all([
        supabase
          .from("blocks")
          .select("blocked_id, block_scope")
          .eq("blocker_id", currentUserId),
        supabase
          .from("blocks")
          .select("blocker_id, block_scope")
          .eq("blocked_id", currentUserId),
      ]);

      // Track unique (userId, scope) pairs — a user can have BOTH scopes
      const seen = new Set<string>();
      const records: BlockRecord[] = [];

      blockedByMe.data?.forEach((b) => {
        const scope = (b.block_scope as BlockScope) ?? "profile_only";
        const key = `${b.blocked_id}:${scope}`;
        if (!seen.has(key)) {
          seen.add(key);
          records.push({ userId: b.blocked_id, scope });
        }
      });

      // For users who blocked me, add as profile_only if not already present
      blockedMe.data?.forEach((b) => {
        const key = `${b.blocker_id}:profile_only`;
        if (!seen.has(key)) {
          seen.add(key);
          records.push({ userId: b.blocker_id, scope: "profile_only" });
        }
      });

      return records;
    },
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
 * Returns true if a chat with `otherUserId` should be hidden
 * (only profile_only blocks hide chats).
 */
export function isBlockedChat(
  blocks: BlockRecord[],
  otherUserId: string | null | undefined
): boolean {
  if (!otherUserId) return false;
  return blocks.some(
    (b) => b.userId === otherUserId && b.scope === "profile_only"
  );
}
