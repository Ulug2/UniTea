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
import SupabaseImage from "./SupabaseImage";
import { useImageAspectRatio } from "../hooks/useImageAspectRatio";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const DEFAULT_BACKGROUND = "#F0F0F0";
const SINGLE_MAX_HEIGHT_RATIO = 0.55;
const GALLERY_ITEM_WIDTH = scale(225);
const GALLERY_ITEM_HEIGHT = verticalScale(300);

type ResponsiveImageProps = {
  source: string;
  bucket?: string;
  sourceKind?: "auto" | "uri" | "supabasePath";
  mode?: "single" | "galleryPreview";
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
  const { height: screenHeight } = useWindowDimensions();
  const hasKnownRatio = typeof knownAspectRatio === "number" && knownAspectRatio > 0;
  const measureUri = hasKnownRatio ? null : resolveAspectUri(source, bucket, sourceKind);
  const dynamicAspectRatio = useImageAspectRatio(measureUri, { clamp: false });
  const aspectRatio = hasKnownRatio ? knownAspectRatio : dynamicAspectRatio;
  const isDirectUri = sourceKind === "uri" || (sourceKind === "auto" && isUri(source));

  const [isImageLoading, setIsImageLoading] = useState(true);

  useEffect(() => {
    setIsImageLoading(true);
  }, [source]);

  const handleImageLoad = useCallback(() => {
    setIsImageLoading(false);
    onLoad?.();
  }, [onLoad]);

  const contentFit = "cover";
  const contentPosition = mode === "single" ? "top center" : "center";

  const containerStyle: StyleProp<ViewStyle> =
    mode === "single"
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
    mode === "single"
      ? {
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          borderRadius,
        }
      : { width: "100%", height: "100%" };

  const container = (
    <View style={containerStyle}>
      {isDirectUri ? (
        <ExpoImage
          source={{ uri: source }}
          style={imageStyle}
          contentFit={contentFit}
          contentPosition={contentPosition}
          cachePolicy="disk"
          onLoad={handleImageLoad}
        />
      ) : (
        <SupabaseImage
          path={source}
          bucket={bucket}
          style={imageStyle}
          contentFit={contentFit}
          contentPosition={contentPosition}
          loadingBackgroundColor={backgroundColor}
          onLoad={handleImageLoad}
        />
      )}
      {isImageLoading && (
        <View style={loadingStyles.overlay}>
          <ActivityIndicator size="small" color="#999" />
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
