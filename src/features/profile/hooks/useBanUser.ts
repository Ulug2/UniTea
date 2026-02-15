import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

export type BanDuration = "10_days" | "1_month" | "1_year" | "permanent";

export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      duration,
    }: {
      userId: string;
      duration: BanDuration;
    }) => {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase configuration");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("You must be logged in to ban users");

      const res = await fetch(`${supabaseUrl}/functions/v1/ban-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ user_id: userId, duration }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to ban user");
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to ban user. Please try again.";
      Alert.alert("Error", message);
    },
  });
}
