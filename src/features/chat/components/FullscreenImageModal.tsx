import React, { useEffect, useState } from "react";
import { FullscreenImageModal as SharedFullscreenImageModal } from "../../../components/FullscreenImageModal";
import { supabase } from "../../../lib/supabase";
import { logger } from "../../../utils/logger";

const SIGNED_URL_TTL_SECONDS = 3600;

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
  // chat-images is a private bucket — the URL must be a signed URL, resolved
  // via an authorized request (storage RLS scopes signing to the chat's
  // participants), not built synchronously like the old public-URL string.
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !imagePath) {
      setImageUri(null);
      return;
    }

    let isCancelled = false;
    supabase.storage
      .from("chat-images")
      .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (isCancelled) return;
        if (error || !data) {
          logger.warn("FullscreenImageModal: failed to sign chat image URL", error ?? undefined);
          setImageUri(null);
          return;
        }
        setImageUri(data.signedUrl);
      });

    return () => {
      isCancelled = true;
    };
  }, [visible, imagePath]);

  return (
    <SharedFullscreenImageModal
      visible={visible}
      uri={imageUri}
      onClose={onClose}
    />
  );
}
