import React from "react";
import { FullscreenImageModal as SharedFullscreenImageModal } from "../../../components/FullscreenImageModal";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

type FullscreenImageModalProps = {
  visible: boolean;
  imagePath: string | null;
  onClose: () => void;
};

export function FullscreenImageModal({
  visible,
  imagePath,
  onClose,
}: FullscreenImageModalProps) {
  // chat-images is a public bucket — construct the URL synchronously so expo-image
  // can serve it from the disk cache without a network round-trip.
  const imageUri =
    imagePath != null
      ? `${SUPABASE_URL}/storage/v1/object/public/chat-images/${imagePath}`
      : null;

  return (
    <SharedFullscreenImageModal
      visible={visible}
      uri={imageUri}
      onClose={onClose}
    />
  );
}
