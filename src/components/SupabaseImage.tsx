import { ComponentProps, useMemo, useState, useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image";
import { supabase } from "../lib/supabase";
import { getPublicStorageUrl } from "../utils/publicStorageUrl";
import {
  getCachedSignedUrl,
  getSignedStorageUrl,
  storageImageCacheKey,
} from "../utils/signedStorageUrl";
import React from "react";

type SupabaseImageProps = {
  bucket?: string;
  path: string;
  contentFit?: "cover" | "contain" | "fill" | "scale-down";
  transition?: number;
  /**
   * Cache-busting token (e.g. the owning row's updated_at) for
   * deterministic storage paths that get overwritten in place —
   * appended as a `?v=` query param so a replaced image is refetched
   * instead of served from a stale client/CDN cache under the same URL.
   */
  version?: string | number | null;
  /** Background color while loading (default: gainsboro) */
  loadingBackgroundColor?: string;
  /** ActivityIndicator color while loading */
  loadingIndicatorColor?: string;
  /** Called when the image has finished loading (or when there is no image to load) */
  onLoad?: () => void;
  /** Called when the image fails to load, including when the source URL itself can't be resolved */
  onError?: () => void;
} & Omit<ComponentProps<typeof Image>, "source" | "onLoad" | "onError">;

// Buckets confirmed as public — URL can be constructed synchronously, no HEAD check needed.
const PUBLIC_BUCKETS = new Set(["avatars", "post-images"]);

// Cache for bucket public/private status (persists across component mounts).
// chat-images is seeded as known-private so the very first image in a cold
// app session skips the "unknown bucket" HEAD-check round trip below and
// goes straight to createSignedUrl — its privacy is a fixed migration-level
// fact here, not something that needs runtime detection like the fallback
// path below still does for any future/uninstrumented bucket.
const bucketCache = new Map<string, boolean>([["chat-images", false]]);

/**
 * PRODUCTION-READY: Uses public/signed URLs with expo-image's disk caching
 * NO MEMORY LEAKS - Images are cached to disk, not loaded as Base64 strings
 * OPTIMIZED: Caches bucket status and signed URLs to prevent unnecessary reloads
 * ZERO-LATENCY for known-public buckets (e.g. avatars) — URL is constructed
 * synchronously so isLoading never starts as true and the spinner never flickers.
 */
function SupabaseImage({
  path,
  bucket = "post-images",
  contentFit = "cover",
  transition = bucket === "avatars" ? 0 : 200,
  version,
  loadingBackgroundColor = "#F0F0F0",
  loadingIndicatorColor,
  onLoad,
  onError,
  ...imageProps
}: SupabaseImageProps) {
  const isKnownPublic = PUBLIC_BUCKETS.has(bucket);
  // Set only when the URL is a signed URL — keys expo-image's cache by object
  // path instead of the per-request token in the URL.
  const [imageCacheKey, setImageCacheKey] = useState<string | undefined>(undefined);

  // Lazy initialisers run synchronously before the first paint.
  // For known-public buckets the URL is available immediately — isLoading stays
  // false and the ActivityIndicator is never shown, even on cold start.
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    isKnownPublic && path ? getPublicStorageUrl(bucket, path, version) : null
  );
  const [isLoading, setIsLoading] = useState(() => !(isKnownPublic && path));

  const isMountedRef = useRef(true);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setIsLoading(false);
      setImageUrl(null);
      return;
    }

    if (isKnownPublic) {
      // URL is deterministic — update state if path/bucket/version changed
      // and seed the runtime cache so other components skip the HEAD check too.
      const url = getPublicStorageUrl(bucket, path, version);
      bucketCache.set(bucket, true);
      if (isMountedRef.current) {
        setImageCacheKey(undefined);
        setImageUrl(url);
        setIsLoading(false);
      }
      return;
    }

    let isCancelled = false;
    const applySignedUrl = (url: string) => {
      if (isCancelled || !isMountedRef.current) return;
      setImageCacheKey(storageImageCacheKey(bucket, path));
      setImageUrl(url);
      setIsLoading(false);
    };

    const cachedSigned =
      bucketCache.get(bucket) === false ? getCachedSignedUrl(bucket, path) : null;
    if (cachedSigned) {
      applySignedUrl(cachedSigned);
      return;
    }

    const getImageUrl = async () => {
      try {
        const isPublic = bucketCache.get(bucket);

        if (isPublic === undefined) {
          // Not cached — check if bucket is public via HEAD
          const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

          try {
            const response = await fetch(publicData.publicUrl, {
              method: "HEAD",
              cache: "no-store",
            });

            const isPublicBucket = response.ok;
            bucketCache.set(bucket, isPublicBucket);

            if (isPublicBucket && isMountedRef.current) {
              setImageUrl(publicData.publicUrl);
              setIsLoading(false);
              return;
            }
          } catch {
            bucketCache.set(bucket, false);
          }
        } else if (isPublic) {
          const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

          if (isMountedRef.current) {
            setImageUrl(publicData.publicUrl);
            setIsLoading(false);
          }
          return;
        }

        // Bucket is private — use a signed URL
        applySignedUrl(await getSignedStorageUrl(bucket, path));
      } catch (error) {
        console.error("[SupabaseImage] Error loading image:", error);
        if (!isCancelled && isMountedRef.current) {
          setImageUrl(null);
          setIsLoading(false);
        }
      }
    };

    getImageUrl();
    return () => {
      isCancelled = true;
    };
  }, [path, bucket, isKnownPublic, version]);

  // Memoize the image source to prevent unnecessary re-renders
  // MUST be called before any early returns (Rules of Hooks)
  const imageSource = useMemo(
    () => ({ uri: imageUrl || undefined, cacheKey: imageCacheKey }),
    [imageUrl, imageCacheKey],
  );

  // When resolution finishes with no URL: if a path was actually given, that's
  // a real failure (e.g. signed URL fetch threw) — report it as an error
  // rather than silently rendering a blank box forever. If no path was given
  // at all, there was nothing to load, so count it as "loaded" (existing
  // behavior feed image counters rely on).
  // Must run unconditionally (Rules of Hooks)
  useEffect(() => {
    if (!isLoading && !imageUrl) {
      if (path) {
        onErrorRef.current?.();
      } else {
        onLoadRef.current?.();
      }
    }
  }, [isLoading, imageUrl, path]);

  if (isLoading) {
    return (
      <View
        style={[
          {
            backgroundColor: loadingBackgroundColor,
            alignItems: "center",
            justifyContent: "center",
          },
          imageProps.style,
        ]}
      >
        <ActivityIndicator color={loadingIndicatorColor} />
      </View>
    );
  }

  if (!imageUrl) {
    return (
      <View
        style={[
          {
            backgroundColor: "#F0F0F0",
            alignItems: "center",
            justifyContent: "center",
          },
          imageProps.style,
        ]}
      />
    );
  }

  const handleLoad = () => {
    onLoadRef.current?.();
  };

  const handleError = () => {
    onErrorRef.current?.();
  };

  return (
    <Image
      source={imageSource}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="disk"
      onLoad={handleLoad}
      onError={handleError}
      {...imageProps}
    />
  );
}

// Memoize component to prevent unnecessary re-renders when props haven't changed
export default React.memo(SupabaseImage, (prevProps, nextProps) => {
  return (
    prevProps.path === nextProps.path &&
    prevProps.bucket === nextProps.bucket &&
    prevProps.contentFit === nextProps.contentFit &&
    prevProps.version === nextProps.version
  );
});
