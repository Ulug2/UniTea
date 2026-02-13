import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

type UseReportPostOptions = {
  postId: string | null | undefined;
  viewerId: string | null;
};

export function useReportPost({ postId, viewerId }: UseReportPostOptions) {
  return useMutation({
    mutationFn: async (reason: string) => {
      if (!viewerId || !postId) {
        throw new Error("Missing user or post ID");
      }

      const { error } = await supabase.from("reports").insert({
        reporter_id: viewerId,
        post_id: postId,
        comment_id: null,
        reason,
      });

      if (error) throw error;
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to report post. Please try again.";
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

