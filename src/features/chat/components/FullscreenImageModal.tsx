import React, { useEffect, useState } from "react";
import { FullscreenImageModal as SharedFullscreenImageModal } from "../../../components/FullscreenImageModal";
import { logger } from "../../../utils/logger";
import {
  getSignedStorageUrl,
  storageImageCacheKey,
} from "../../../utils/signedStorageUrl";

const BUCKET = "chat-images";

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
  // chat-images is a private bucket, so the URL is a signed URL (storage RLS
  // scopes signing to the chat's participants). getSignedStorageUrl shares its
  // cache with the chat bubble (SupabaseImage), and the stable cacheKey lets
  // expo-image reuse the bubble's download instead of fetching it again.
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setImageUri(null);
    setResolveFailed(false);
    if (!visible || !imagePath) return;

    let isCancelled = false;
    getSignedStorageUrl(BUCKET, imagePath)
      .then((url) => {
        if (!isCancelled) setImageUri(url);
      })
      .catch((error) => {
        if (isCancelled) return;
        logger.warn("FullscreenImageModal: failed to sign chat image URL", {
          message: error instanceof Error ? error.message : String(error),
        });
        setResolveFailed(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [visible, imagePath, retryCount]);

  return (
    <SharedFullscreenImageModal
      visible={visible}
      uri={imageUri}
      cacheKey={imagePath ? storageImageCacheKey(BUCKET, imagePath) : undefined}
      isResolving={visible && !!imagePath && !imageUri && !resolveFailed}
      resolveFailed={resolveFailed}
      onRetry={() => setRetryCount((n) => n + 1)}
      onClose={onClose}
    />
  );
}
