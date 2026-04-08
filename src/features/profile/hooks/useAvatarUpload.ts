import { Alert } from "react-native";
import { supabase } from "../../../lib/supabase";
import { uploadImage } from "../../../utils/supabaseImages";
import { useUpdateProfile } from "./useUpdateProfile";
import { useImagePipeline } from "../../../hooks/useImagePipeline";
import { useAuth } from "../../../context/AuthContext";

export type AvatarUploadResult = {
  status: "success" | "cancelled" | "error";
  message?: string;
};

export function useAvatarUpload() {
  const { session } = useAuth();
  const updateProfileMutation = useUpdateProfile();
  const { pickAndPrepareImage } = useImagePipeline({
    allowEditing: true,
    aspect: [1, 1],
  });

  const startAvatarUpload = async (): Promise<AvatarUploadResult> => {
    try {
      const picked = await pickAndPrepareImage();
      if (!picked) return { status: "cancelled" };
      const { uri } = picked;

      // Read the current avatar path BEFORE uploading the new one so we can
      // delete it from storage after the DB update succeeds.
      const currentUserId = session?.user?.id;
      let oldAvatarPath: string | null = null;
      if (currentUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", currentUserId)
          .single();
        // Only track storage paths — ignore full HTTP URLs (e.g. OAuth avatars)
        if (profile?.avatar_url && !profile.avatar_url.startsWith("http")) {
          oldAvatarPath = profile.avatar_url;
        }
      }

      const imagePath = await uploadImage(uri, supabase, "avatars");
      await updateProfileMutation.mutateAsync({ avatar_url: imagePath });

      // Delete the old avatar from storage now that the DB points to the new one.
      // Non-fatal — a failed delete just leaves an orphaned file.
      if (oldAvatarPath) {
        const { error: storageError } = await supabase.storage
          .from("avatars")
          .remove([oldAvatarPath]);
        if (storageError) {
          console.warn("[useAvatarUpload] Failed to delete old avatar:", storageError.message);
        }
      }

      return { status: "success" };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update avatar. Please try again.";
      Alert.alert("Error", message);
      return { status: "error", message };
    }
  };

  return {
    startAvatarUpload,
    isUploading: updateProfileMutation.isPending,
    updateProfileMutation,
  };
}
