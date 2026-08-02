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

      const currentUserId = session?.user?.id;
      if (!currentUserId) {
        throw new Error("You must be logged in to update your avatar.");
      }

      // Deterministic path: one stable object per user
      // (avatars/{userId}/avatar.{ext}). Every replacement overwrites the
      // same object in place (upsert) instead of creating a new random
      // object each time — no separate "delete the old one" step needed
      // or possible, since there is no longer an "old path" distinct from
      // the current one. If this upload fails, the existing object at
      // that path is untouched (upsert only replaces on success), so a
      // failed replacement can never leave the user without an avatar.
      const imagePath = await uploadImage(uri, supabase, "avatars", undefined, undefined, undefined, {
        path: `${currentUserId}/avatar`,
        upsert: true,
      });
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
