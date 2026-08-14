import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { isRateLimitError } from "../../../utils/clientRateLimit";

type UseReportCommunityOptions = {
  communityId: string | null | undefined;
  viewerId: string | null;
};

export function useReportCommunity({
  communityId,
  viewerId,
}: UseReportCommunityOptions) {
  return useMutation({
    mutationFn: async (reason: string) => {
      if (!viewerId || !communityId) {
        throw new Error("Missing user or community ID");
      }

      // community_id isn't in the generated Database types yet (added by
      // this phase's migration) — cast per project convention rather than
      // regenerating types from the live schema, which pulls in unrelated
      // schema drift (see communities/types.ts's own note on this).
      const { error } = await (supabase.from("reports") as any).insert({
        reporter_id: viewerId,
        post_id: null,
        comment_id: null,
        community_id: communityId,
        reason,
      });

      if (error) throw error;
    },
    onError: (error: unknown) => {
      if (isRateLimitError(error)) {
        Alert.alert("Slow down", "You're submitting reports too quickly. Please wait a moment.");
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Failed to report community. Please try again.";
      Alert.alert("Error", message);
    },
    onSuccess: () => {
      Alert.alert(
        "Reported",
        "Thank you for helping keep the community safe."
      );
    },
  });
}
