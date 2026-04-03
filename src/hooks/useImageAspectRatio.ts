import { useEffect, useState } from "react";
import { Image } from "react-native";

const DEFAULT_ASPECT_RATIO = 4 / 3;
const MIN_ASPECT_RATIO = 9 / 16;
const MAX_ASPECT_RATIO = 16 / 9;

const aspectRatioCache = new Map<string, number>();

function clampAspectRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_ASPECT_RATIO;
  }

  return Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, value));
}

type UseImageAspectRatioOptions = {
  clamp?: boolean;
};

export function useImageAspectRatio(
  uri: string | null | undefined,
  options?: UseImageAspectRatioOptions,
): number {
  const shouldClamp = options?.clamp ?? false;

  const [aspectRatio, setAspectRatio] = useState<number>(() => {
    if (!uri) return DEFAULT_ASPECT_RATIO;
    return aspectRatioCache.get(uri) ?? DEFAULT_ASPECT_RATIO;
  });

  useEffect(() => {
    if (!uri) {
      setAspectRatio(DEFAULT_ASPECT_RATIO);
      return;
    }

    const cached = aspectRatioCache.get(uri);
    if (cached) {
      setAspectRatio(cached);
      return;
    }

    let isCancelled = false;

    Image.getSize(
      uri,
      (width, height) => {
        if (isCancelled) return;
        const measuredRatio = width / height;
        const nextRatio = shouldClamp
          ? clampAspectRatio(measuredRatio)
          : measuredRatio;
        aspectRatioCache.set(uri, nextRatio);
        setAspectRatio(nextRatio);
      },
      () => {
        if (isCancelled) return;
        setAspectRatio(DEFAULT_ASPECT_RATIO);
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [uri, shouldClamp]);

  return aspectRatio;
}
