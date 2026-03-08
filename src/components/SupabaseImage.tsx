import { ComponentProps, useMemo, useState, useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image";
import { supabase } from "../lib/supabase";
import React from "react";

type SupabaseImageProps = {
  bucket?: string;
  path: string;
  contentFit?: "cover" | "contain" | "fill" | "scale-down";
  transition?: number;
  /** Background color while loading (default: gainsboro) */
  loadingBackgroundColor?: string;
  /** ActivityIndicator color while loading */
  loadingIndicatorColor?: string;
  /** Called when the image has finished loading (or when there is no image to load) */
  onLoad?: () => void;
} & Omit<ComponentProps<typeof Image>, "source" | "onLoad">;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

// Buckets confirmed as public — URL can be constructed synchronously, no HEAD check needed.
const PUBLIC_BUCKETS = new Set(["avatars", "post-images", "chat-images"]);

// Cache for bucket public/private status (persists across component mounts)
const bucketCache = new Map<string, boolean>();

// Cache for signed URLs with expiry tracking
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getPublicStorageUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

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
  transition = 200,
  loadingBackgroundColor = "gainsboro",
  loadingIndicatorColor,
  onLoad,
  ...imageProps
}: SupabaseImageProps) {
  const isKnownPublic = PUBLIC_BUCKETS.has(bucket);
  const cacheKey = `${bucket}:${path}`;

  // Lazy initialisers run synchronously before the first paint.
  // For known-public buckets the URL is available immediately — isLoading stays
  // false and the ActivityIndicator is never shown, even on cold start.
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    isKnownPublic && path ? getPublicStorageUrl(bucket, path) : null
  );
  const [isLoading, setIsLoading] = useState(() => !(isKnownPublic && path));

  const isMountedRef = useRef(true);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

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
      // URL is deterministic — update state if path/bucket changed and seed the
      // runtime cache so other components skip the HEAD check too.
      const url = getPublicStorageUrl(bucket, path);
      bucketCache.set(bucket, true);
      if (isMountedRef.current) {
        setImageUrl(url);
        setIsLoading(false);
      }
      return;
    }

    // Check if we have a cached signed URL that's still valid
    const cachedSigned = signedUrlCache.get(cacheKey);
    if (cachedSigned && cachedSigned.expiresAt > Date.now() + 60_000) {
      if (isMountedRef.current) {
        setImageUrl(cachedSigned.url);
        setIsLoading(false);
      }
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

        // Bucket is private — use signed URL
        const cached = signedUrlCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          if (isMountedRef.current) {
            setImageUrl(cached.url);
            setIsLoading(false);
          }
          return;
        }

        // Generate new signed URL (valid for 1 hour)
        const { data: signedData, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 3600);

        if (error) throw error;

        signedUrlCache.set(cacheKey, {
          url: signedData.signedUrl,
          expiresAt: Date.now() + 3_300_000, // 55 minutes
        });

        if (isMountedRef.current) {
          setImageUrl(signedData.signedUrl);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("[SupabaseImage] Error loading image:", error);
        if (isMountedRef.current) {
          setImageUrl(null);
          setIsLoading(false);
        }
      }
    };

    getImageUrl();
  }, [path, bucket, cacheKey, isKnownPublic]);

  // Memoize the image source to prevent unnecessary re-renders
  // MUST be called before any early returns (Rules of Hooks)
  const imageSource = useMemo(() => ({ uri: imageUrl || undefined }), [imageUrl]);

  // Notify parent when there is no image to load (so feed can count this as "loaded")
  // Must run unconditionally (Rules of Hooks)
  useEffect(() => {
    if (!isLoading && !imageUrl) {
      onLoadRef.current?.();
    }
  }, [isLoading, imageUrl]);

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
            backgroundColor: "#f0f0f0",
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

  return (
    <Image
      source={imageSource}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="disk"
      onLoad={handleLoad}
      {...imageProps}
    />
  );
}

// Memoize component to prevent unnecessary re-renders when props haven't changed
export default React.memo(SupabaseImage, (prevProps, nextProps) => {
  return (
    prevProps.path === nextProps.path &&
    prevProps.bucket === nextProps.bucket &&
    prevProps.contentFit === nextProps.contentFit
  );
});
