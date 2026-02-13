import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update password. Please try again.";
      Alert.alert("Error", message);
    },
  });
}

