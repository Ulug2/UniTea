import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

type UpdatePasswordArgs = {
  currentPassword: string;
  newPassword: string;
};

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async ({ currentPassword, newPassword }: UpdatePasswordArgs) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        throw new Error("Unable to verify identity. Please sign out and sign in again.");
      }

      // Re-authenticate to verify the current password before allowing the change.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        throw new Error("Incorrect current password. Please try again.");
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
  });
}
