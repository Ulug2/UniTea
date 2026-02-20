import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../../lib/supabase";
import { uploadImage } from "../../../utils/supabaseImages";
import { useUpdateProfile } from "./useUpdateProfile";

export type AvatarUploadResult = {
  status: "success" | "cancelled" | "error";
  message?: string;
};

export function useAvatarUpload() {
  const updateProfileMutation = useUpdateProfile();

  const startAvatarUpload = async (): Promise<AvatarUploadResult> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return { status: "cancelled" };

      const imagePath = await uploadImage(
        result.assets[0].uri,
        supabase,
        "avatars"
      );

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

