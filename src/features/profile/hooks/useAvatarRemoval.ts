import { Alert } from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useUpdateProfile } from "./useUpdateProfile";
import { logger } from "../../../utils/logger";
import type { AvatarUploadResult } from "./useAvatarUpload";

export function useAvatarRemoval() {
  const { session } = useAuth();
  const updateProfileMutation = useUpdateProfile();

  const removeAvatar = async (
    currentAvatarPath: string | null | undefined,
  ): Promise<AvatarUploadResult> => {
    try {
      const currentUserId = session?.user?.id;
      if (!currentUserId) {
        throw new Error("You must be logged in to remove your avatar.");
      }

      // Best-effort storage cleanup — the deterministic {userId}/avatar.{ext}
      // path is exactly what's already stored as avatar_url (see
      // useAvatarUpload's upsert comment), so no extension-guessing is
      // needed. A storage failure here must not block the DB update below:
      // clearing avatar_url is what makes the themed default avatar appear,
      // and that's the user-visible effect that matters.
      if (currentAvatarPath) {
        const { error: storageError } = await supabase.storage
          .from("avatars")
          .remove([currentAvatarPath]);
        if (storageError) {
          logger.warn("[useAvatarRemoval] failed to delete stored avatar object", {
            error: storageError,
          });
        }
      }

      await updateProfileMutation.mutateAsync({ avatar_url: null });

      return { status: "success" };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to remove avatar. Please try again.";
      Alert.alert("Error", message);
      return { status: "error", message };
    }
  };

  return {
    removeAvatar,
    isRemoving: updateProfileMutation.isPending,
  };
}
