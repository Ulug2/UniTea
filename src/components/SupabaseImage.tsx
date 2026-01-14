import { ComponentProps, useMemo, useState, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image"; // Better caching than react-native Image
import { supabase } from "../lib/supabase";

type SupabaseImageProps = {
  bucket?: string;
  path: string;
  contentFit?: "cover" | "contain" | "fill" | "scale-down";
  transition?: number;
} & Omit<ComponentProps<typeof Image>, "source">;

/**
 * PRODUCTION-READY: Uses public/signed URLs with expo-image's disk caching
 * NO MEMORY LEAKS - Images are cached to disk, not loaded as Base64 strings
 */
export default function SupabaseImage({
  path,
  bucket = "post-images",
  contentFit = "cover",
  transition = 200,
  ...imageProps
}: SupabaseImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!path) {
      setIsLoading(false);
      return;
    }

    const getImageUrl = async () => {
      try {
        // Try public URL first (works if bucket is public)
        const { data: publicData } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);

        // Check if bucket is public by attempting to fetch
        const response = await fetch(publicData.publicUrl, { method: "HEAD" });

        if (response.ok) {
          // Bucket is public, use public URL
          setImageUrl(publicData.publicUrl);
        } else {
          // Bucket is private, use signed URL (valid for 1 hour)
          const { data: signedData, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, 3600); // 1 hour expiry

          if (error) throw error;
          setImageUrl(signedData.signedUrl);
        }
      } catch (error) {
        console.error("[SupabaseImage] Error loading image:", error);
        setImageUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    getImageUrl();
  }, [path, bucket]);

  if (isLoading) {
    return (
      <View
        style={[
          {
            backgroundColor: "gainsboro",
            alignItems: "center",
            justifyContent: "center",
          },
          imageProps.style,
        ]}
      >
        <ActivityIndicator />
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
      source={{ uri: imageUrl }}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="disk" // Critical: Caches to disk, not memory
      {...imageProps}
    />
  );
}
