import { useCallback, useMemo, useState } from "react";
import type { FullscreenImage } from "../components/FullscreenImageModal";

/**
 * Screen-level state for the shared FullscreenImageModal: `open(uris, index)`
 * from an image tap, spread `modalProps` onto the modal.
 */
export function useFullscreenGallery() {
  const [gallery, setGallery] = useState<{ uris: string[]; index: number } | null>(null);

  const open = useCallback((uris: string[], index = 0) => {
    if (uris.length > 0) setGallery({ uris, index });
  }, []);
  const close = useCallback(() => setGallery(null), []);

  const modalProps = useMemo(
    () => ({
      visible: gallery !== null,
      images: (gallery?.uris ?? []).map((uri): FullscreenImage => ({ uri })),
      initialIndex: gallery?.index ?? 0,
      onClose: close,
    }),
    [gallery, close],
  );

  return { open, modalProps };
}
