import { Alert } from "react-native";
import { supabase } from "../../../lib/supabase";
import { uploadImage } from "../../../utils/supabaseImages";
import { useUpdateProfile } from "./useUpdateProfile";
import { useImagePipeline } from "../../../hooks/useImagePipeline";

export type AvatarUploadResult = {
  status: "success" | "cancelled" | "error";
  message?: string;
};

export function useAvatarUpload() {
  const updateProfileMutation = useUpdateProfile();
  const { pickAndPrepareImage } = useImagePipeline({
    allowEditing: true,
    aspect: [1, 1],
  });

  const startAvatarUpload = async (): Promise<AvatarUploadResult> => {
    try {
      const uri = await pickAndPrepareImage();
      if (!uri) return { status: "cancelled" };

      const imagePath = await uploadImage(uri, supabase, "avatars");
      await updateProfileMutation.mutateAsync({ avatar_url: imagePath });
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
