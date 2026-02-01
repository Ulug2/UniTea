import { ComponentProps, useMemo, useState, useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image"; // Better caching than react-native Image
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
} & Omit<ComponentProps<typeof Image>, "source">;

// Cache for bucket public/private status (persists across component mounts)
const bucketCache = new Map<string, boolean>();

// Cache for signed URLs with expiry tracking
const signedUrlCache = new Map<
  string,
  { url: string; expiresAt: number }
>();

/**
 * PRODUCTION-READY: Uses public/signed URLs with expo-image's disk caching
 * NO MEMORY LEAKS - Images are cached to disk, not loaded as Base64 strings
 * OPTIMIZED: Caches bucket status and signed URLs to prevent unnecessary reloads
 */
function SupabaseImage({
  path,
  bucket = "post-images",
  contentFit = "cover",
  transition = 200,
  loadingBackgroundColor = "gainsboro",
  loadingIndicatorColor,
  ...imageProps
}: SupabaseImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);
  const cacheKey = `${bucket}:${path}`;

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

    // Check if we have a cached signed URL that's still valid
    const cachedSigned = signedUrlCache.get(cacheKey);
    if (cachedSigned && cachedSigned.expiresAt > Date.now() + 60000) {
      // Still valid (at least 1 minute remaining)
      if (isMountedRef.current) {
        setImageUrl(cachedSigned.url);
        setIsLoading(false);
      }
      return;
    }

    const getImageUrl = async () => {
      try {
        // Check cache for bucket public/private status
        const isPublic = bucketCache.get(bucket);

        if (isPublic === undefined) {
          // Not cached, check if bucket is public
          const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

          try {
            const response = await fetch(publicData.publicUrl, {
              method: "HEAD",
              cache: "no-store" // Don't cache the HEAD request itself
            });

            const isPublicBucket = response.ok;
            bucketCache.set(bucket, isPublicBucket);

            if (isPublicBucket && isMountedRef.current) {
              setImageUrl(publicData.publicUrl);
              setIsLoading(false);
              return;
            }
          } catch {
            // Fetch failed, assume private
            bucketCache.set(bucket, false);
          }
        } else if (isPublic) {
          // Bucket is public (cached), use public URL directly
          const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

          if (isMountedRef.current) {
            setImageUrl(publicData.publicUrl);
            setIsLoading(false);
          }
          return;
        }

        // Bucket is private, check cached signed URL first
        const cached = signedUrlCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          // Use cached signed URL
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

        // Cache the signed URL with expiry
        signedUrlCache.set(cacheKey, {
          url: signedData.signedUrl,
          expiresAt: Date.now() + 3300000, // 55 minutes (refresh before 1 hour expiry)
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
  }, [path, bucket, cacheKey]);

  // Memoize the image source to prevent unnecessary re-renders
  // MUST be called before any early returns (Rules of Hooks)
  const imageSource = useMemo(() => ({ uri: imageUrl || undefined }), [imageUrl]);

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

  return (
    <Image
      source={imageSource}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="disk" // Critical: Caches to disk, not memory
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
