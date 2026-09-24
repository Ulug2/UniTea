import React, { useEffect, useMemo, useState } from "react";
import {
  FullscreenImageModal as SharedFullscreenImageModal,
  type FullscreenImage,
} from "../../../components/FullscreenImageModal";
import { logger } from "../../../utils/logger";
import {
  getCachedSignedUrl,
  getSignedStorageUrl,
  storageImageCacheKey,
} from "../../../utils/signedStorageUrl";

const BUCKET = "chat-images";

type FullscreenImageModalProps = {
  visible: boolean;
  /** Storage paths of the message's images, in order. */
  imagePaths: string[];
  initialIndex: number;
  onClose: () => void;
};

export function FullscreenImageModal({
  visible,
  imagePaths,
  initialIndex,
  onClose,
}: FullscreenImageModalProps) {
  // chat-images is a private bucket, so each URL is a signed URL (storage RLS
  // scopes signing to the chat's participants). getSignedStorageUrl shares its
  // cache with the chat bubble (SupabaseImage), and the stable cacheKey lets
  // expo-image reuse the bubble's download instead of fetching it again.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [resolveFailed, setResolveFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const pathsKey = imagePaths.join("|");

  useEffect(() => {
    setResolveFailed(false);
    if (!visible || imagePaths.length === 0) {
      setSignedUrls({});
      return;
    }

    let isCancelled = false;
    // Seed synchronously from the cache (usually warm from the bubble), then
    // resolve each image independently so one failure doesn't hide the rest.
    const seeded: Record<string, string> = {};
    for (const path of imagePaths) {
      const cached = getCachedSignedUrl(BUCKET, path);
      if (cached) seeded[path] = cached;
    }
    setSignedUrls(seeded);

    for (const path of imagePaths) {
      if (seeded[path]) continue;
      getSignedStorageUrl(BUCKET, path)
        .then((url) => {
          if (!isCancelled) setSignedUrls((prev) => ({ ...prev, [path]: url }));
        })
        .catch((error) => {
          if (isCancelled) return;
          logger.warn("FullscreenImageModal: failed to sign chat image URL", {
            message: error instanceof Error ? error.message : String(error),
          });
          setResolveFailed(true);
        });
    }

    return () => {
      isCancelled = true;
    };
    // pathsKey stands in for imagePaths (a new array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pathsKey, retryCount]);

  const images = useMemo<FullscreenImage[]>(
    () =>
      imagePaths.map((path) => ({
        uri: signedUrls[path] ?? null,
        cacheKey: storageImageCacheKey(BUCKET, path),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathsKey, signedUrls],
  );

  return (
    <SharedFullscreenImageModal
      visible={visible}
      images={images}
      initialIndex={initialIndex}
      resolveFailed={resolveFailed}
      onRetry={() => setRetryCount((n) => n + 1)}
      onClose={onClose}
    />
  );
}
