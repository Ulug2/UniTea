import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  ImageStyle,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import SupabaseImage from "./SupabaseImage";
import { useImageAspectRatio } from "../hooks/useImageAspectRatio";
import { moderateScale, scale, verticalScale } from "../utils/scaling";
import { getChatImageDimensions } from "../utils/chatImageSizing";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const DEFAULT_BACKGROUND = "#F0F0F0";
const SINGLE_MAX_HEIGHT_RATIO = 0.55;
const GALLERY_ITEM_WIDTH = scale(225);
const GALLERY_ITEM_HEIGHT = verticalScale(300);
const IMAGE_TRANSITION_MS = 150;

type ResponsiveImageProps = {
  source: string;
  bucket?: string;
  sourceKind?: "auto" | "uri" | "supabasePath";
  mode?: "single" | "galleryPreview" | "chatBubble";
  /** Pre-computed aspect ratio from the DB — bypasses the network Image.getSize call. */
  knownAspectRatio?: number | null;
  borderRadius?: number;
  backgroundColor?: string;
  onPress?: () => void;
  onLoad?: () => void;
  style?: StyleProp<ViewStyle | ImageStyle>;
};

function isUri(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function resolveAspectUri(
  source: string,
  bucket: string,
  sourceKind: "auto" | "uri" | "supabasePath",
): string | null {
  if (!source) return null;
  const shouldUseUri = sourceKind === "uri" || (sourceKind === "auto" && isUri(source));
  if (shouldUseUri) return source;
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${source}`;
}

export default function ResponsiveImage({
  source,
  bucket = "post-images",
  sourceKind = "auto",
  mode = "single",
  knownAspectRatio,
  borderRadius = moderateScale(10),
  backgroundColor = DEFAULT_BACKGROUND,
  onPress,
  onLoad,
  style,
}: ResponsiveImageProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const hasKnownRatio = typeof knownAspectRatio === "number" && knownAspectRatio > 0;
  const measureUri = hasKnownRatio ? null : resolveAspectUri(source, bucket, sourceKind);
  const dynamicAspectRatio = useImageAspectRatio(measureUri, { clamp: false });
  const aspectRatio = hasKnownRatio ? knownAspectRatio : dynamicAspectRatio;
  const isDirectUri = sourceKind === "uri" || (sourceKind === "auto" && isUri(source));

  // Always start "loading" and let the real onLoad/onError event decide when
  // that's no longer true. Knowing the image URL synchronously (true for
  // public buckets) is not the same as the image's bytes being downloaded and
  // decoded — treating them as equivalent was why previously-sent chat images
  // showed a bare white flash with no spinner while fetching from network.
  // For an already-cached image, expo-image resolves onLoad within the same
  // tick, so this never produces a visible placeholder flash in practice.
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isImageError, setIsImageError] = useState(false);

  useEffect(() => {
    setIsImageLoading(true);
    setIsImageError(false);
  }, [source]);

  const handleImageLoad = useCallback(() => {
    setIsImageLoading(false);
    setIsImageError(false);
    onLoad?.();
  }, [onLoad]);

  const handleImageError = useCallback(() => {
    setIsImageLoading(false);
    setIsImageError(true);
  }, []);

  const contentFit = "cover";
  const contentPosition = mode === "single" ? "top center" : "center";

  // Chat bubbles get fixed pixel dimensions computed from the (ideally
  // known-at-send-time) aspect ratio, fit into a WhatsApp-style min/max
  // bounding box — see getChatImageDimensions. Unlike "single"/"galleryPreview"
  // (which use percentage width + CSS aspectRatio, and can reflow if
  // aspectRatio changes after mount), this gives the container its exact
  // final width/height before the first paint, so it never resizes.
  const chatDimensions =
    mode === "chatBubble"
      ? getChatImageDimensions(aspectRatio, screenWidth, screenHeight)
      : null;

  const containerStyle: StyleProp<ViewStyle> =
    mode === "chatBubble"
      ? [
          {
            width: chatDimensions!.width,
            height: chatDimensions!.height,
            backgroundColor,
            borderRadius,
            overflow: "hidden",
          },
          style,
        ]
      : mode === "single"
        ? [
            {
              width: "100%",
              maxWidth: "100%",
              maxHeight: screenHeight * SINGLE_MAX_HEIGHT_RATIO,
              aspectRatio,
              backgroundColor,
              alignSelf: "flex-start",
              borderRadius,
              overflow: "hidden",
            },
            style,
          ]
        : [
            {
              width: GALLERY_ITEM_WIDTH,
              height: GALLERY_ITEM_HEIGHT,
              backgroundColor,
              borderRadius,
              overflow: "hidden",
            },
            style,
          ];

  const imageStyle: StyleProp<ImageStyle> =
    mode === "galleryPreview"
      ? { width: "100%", height: "100%" }
      : {
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          borderRadius,
        };

  const container = (
    <View style={containerStyle}>
      {isDirectUri ? (
        <ExpoImage
          source={{ uri: source }}
          style={imageStyle}
          contentFit={contentFit}
          contentPosition={contentPosition}
          cachePolicy="disk"
          transition={IMAGE_TRANSITION_MS}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      ) : (
        <SupabaseImage
          path={source}
          bucket={bucket}
          style={imageStyle}
          contentFit={contentFit}
          contentPosition={contentPosition}
          loadingBackgroundColor={backgroundColor}
          transition={IMAGE_TRANSITION_MS}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}
      {isImageLoading && !isImageError && (
        <View style={loadingStyles.overlay}>
          <ActivityIndicator size="small" color="#999" />
        </View>
      )}
      {isImageError && (
        <View style={loadingStyles.overlay}>
          <Ionicons name="image-outline" size={moderateScale(26)} color="#9CA3AF" />
        </View>
      )}
    </View>
  );

  if (!onPress) return container;

  return <Pressable onPress={onPress}>{container}</Pressable>;
}

const loadingStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
