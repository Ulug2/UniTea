import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";

export function useDeleteAccount() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const currentUserId = session?.user?.id;
      if (!currentUserId) throw new Error("User ID missing");

      const { error } = await (supabase.rpc as any)("delete_user_account");

      if (error) throw error;

      await supabase.auth.signOut();
    },
    onSuccess: () => {
      queryClient.clear();
      router.replace("/(auth)");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete account. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

