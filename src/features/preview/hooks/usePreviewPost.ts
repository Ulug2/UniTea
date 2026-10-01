import { useQuery } from "@tanstack/react-query";
import { postDetailQueryOptions } from "../../posts/data/postDetailQuery";
import { useMyProfile } from "../../profile/hooks/useMyProfile";
import { isProfileBanned } from "../../../utils/banStatus";
import { isPreviewablePost, isUuid } from "../utils/previewAccess";
import type { PostsSummaryViewRow } from "../../../types/posts";

export type PreviewPostState =
  | { status: "invalid" }
  | { status: "signed-out" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; post: PostsSummaryViewRow };

/**
 * Loads one live post for the web post card preview through the signed-in
 * viewer's own session (the regular anon-key client, so RLS applies exactly
 * as in the app) via the same query Post Detail uses. Nothing is fetched
 * until there is a session and a well-formed post id.
 */
export function usePreviewPost(
  postId: string | null | undefined,
  viewerId: string | null | undefined,
): PreviewPostState {
  const validPostId = isUuid(postId) ? postId : null;
  const canFetch = !!viewerId && !!validPostId;

  const profileQuery = useMyProfile(viewerId ?? undefined);
  const postQuery = useQuery({
    ...postDetailQueryOptions(validPostId),
    enabled: canFetch,
  });

  if (!validPostId) return { status: "invalid" };
  if (!viewerId) return { status: "signed-out" };
  if (profileQuery.isPending || postQuery.isPending) {
    return { status: "loading" };
  }
  if (profileQuery.isError || postQuery.isError) return { status: "error" };

  const profile = profileQuery.data;
  if (!profile || isProfileBanned(profile)) return { status: "unavailable" };

  const post = postQuery.data;
  if (!isPreviewablePost(post, profile.university_id)) {
    return { status: "unavailable" };
  }
  return { status: "ready", post };
}
