import React from "react";
import {
  ImageStyle,
  Pressable,
  StyleProp,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import SupabaseImage from "./SupabaseImage";
import { useImageAspectRatio } from "../hooks/useImageAspectRatio";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const DEFAULT_BACKGROUND = "#F3F4F6";
const SINGLE_MAX_HEIGHT_RATIO = 0.55;
const GALLERY_ITEM_WIDTH = 225;
const GALLERY_ITEM_HEIGHT = 300;

type ResponsiveImageProps = {
  source: string;
  bucket?: string;
  sourceKind?: "auto" | "uri" | "supabasePath";
  mode?: "single" | "galleryPreview";
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
  borderRadius = 10,
  backgroundColor = DEFAULT_BACKGROUND,
  onPress,
  onLoad,
  style,
}: ResponsiveImageProps) {
  const { height: screenHeight } = useWindowDimensions();
  const measureUri = resolveAspectUri(source, bucket, sourceKind);
  const aspectRatio = useImageAspectRatio(measureUri, { clamp: false });
  const isDirectUri = sourceKind === "uri" || (sourceKind === "auto" && isUri(source));
  const contentPosition = mode === "single" ? "top left" : "center";
  const contentFit = mode === "single" ? "contain" : "cover";

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
          onLoad={onLoad}
        />
      ) : (
        <SupabaseImage
          path={source}
          bucket={bucket}
          style={imageStyle}
          contentFit={contentFit}
          contentPosition={contentPosition}
          loadingBackgroundColor={backgroundColor}
          onLoad={onLoad}
        />
      )}
    </View>
  );

  if (!onPress) return container;

  return <Pressable onPress={onPress}>{container}</Pressable>;
}
