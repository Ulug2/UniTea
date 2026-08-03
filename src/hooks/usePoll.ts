import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";

function isLikelyTransientGatewayError(error: unknown): boolean {
  const msg = String(
    error && typeof error === "object" && "message" in error
      ? (error as { message?: string }).message
      : error,
  );
  return (
    msg.includes("502") ||
    msg.includes("Bad gateway") ||
    msg.includes("<!DOCTYPE html>")
  );
}

export type PollOption = {
  id: string;
  option_text: string;
  position: number;
};

export type PollVote = {
  id: string;
  option_id: string;
  user_id: string;
};

export type PollData = {
  id: string;
  expires_at: string | null;
  allow_multiple: boolean;
  poll_options: PollOption[];
  poll_votes: PollVote[];
};

/**
 * Single source of truth for fetching a post's poll. Shared by Poll.tsx
 * (renders it) and post/[id].tsx (needs to know whether a poll fetch is
 * still pending, so the detail screen doesn't reveal itself with a poll
 * about to pop in a moment later — see Phase 7.2). Both consumers use the
 * exact same query key/queryFn, so React Query dedupes the actual network
 * request regardless of which one mounts first or fetches it — this is the
 * same "keep the fetch logic in exactly one place" fix already applied to
 * the blocks-cache bug in this same phase, applied here pre-emptively so
 * post/[id].tsx's readiness check can never drift out of sync with what
 * Poll.tsx actually renders.
 */
export function usePoll(
  postId: string | null | undefined,
  currentUserId: string | null | undefined,
) {
  return useQuery<PollData | null>({
    queryKey: ["poll", postId, currentUserId],
    enabled: !!postId && !postId.startsWith("temp-"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("polls")
        .select(
          `
            id,
            expires_at,
            allow_multiple,
            poll_options (
              id,
              option_text,
              position
            ),
            poll_votes (
              id,
              option_id,
              user_id
            )
          `
        )
        .eq("post_id", postId)
        .maybeSingle();

      if (error) {
        if (!isLikelyTransientGatewayError(error)) {
          logger.error("[Poll] fetch error", error as Error);
        }
        throw error;
      }

      if (!data) return null;

      return data as PollData;
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
