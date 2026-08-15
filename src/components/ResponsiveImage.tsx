import React, { useState, useEffect, useCallback, useRef } from "react";
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
  /** Cache-busting token for a deterministic path that was overwritten in place — see SupabaseImage. */
  version?: string | number | null;
  /**
   * When true, skip the initial loading-spinner-overlay frame — used when
   * the caller already knows this exact image was successfully rendered in
   * a prior session (e.g. the feed's AsyncStorage-seeded cold-start data,
   * see feedPersistence.ts) and is very likely already in expo-image's disk
   * cache. onLoad/onError still fire normally and correct the state if the
   * assumption is wrong (e.g. genuinely new content), so this is a
   * best-effort optimization, not a correctness guarantee. Defaults to
   * false — every other caller (chat, avatars, communities, a first-ever
   * fetch) is unaffected.
   */
  assumeCached?: boolean;
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
  // chat-images is a private bucket — there is no public URL to measure
  // with here (unlike SupabaseImage's own render path, this hook only
  // wants pixel dimensions and isn't worth resolving a signed URL for).
  // Only reached when the caller has no knownAspectRatio (legacy chat
  // messages predating the stored image_aspect_ratio column); useImageAspectRatio(null)
  // falls back to its DEFAULT_ASPECT_RATIO synchronously, same graceful
  // outcome as today's network measurement failing, just without the
  // doomed request.
  if (bucket === "chat-images") return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${source}`;
}

export default function ResponsiveImage({
  source,
  bucket = "post-images",
  sourceKind = "auto",
  mode = "single",
  knownAspectRatio,
  version,
  assumeCached = false,
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

  // Default to always starting "loading" and letting the real onLoad/onError
  // event decide when that's no longer true. Knowing the image URL
  // synchronously (true for public buckets) is not the same as the image's
  // bytes being downloaded and decoded — treating them as equivalent was why
  // previously-sent chat images showed a bare white flash with no spinner
  // while fetching from network.
  //
  // assumeCached opts out of that initial spinner frame specifically for
  // callers that already know (from a prior successful render, persisted
  // across cold starts — see the assumeCached prop doc above) that this
  // exact image is very likely already in expo-image's disk cache. Without
  // this, every image re-showed its loading-spinner overlay on every cold
  // start even once the Phase 7.1 feed-list fix eliminated the outer
  // skeleton — onLoad/onError still fire and correct isImageLoading either
  // way, so a wrong assumption just means one missed optimization, not a
  // stuck or broken state.
  const [isImageLoading, setIsImageLoading] = useState(!assumeCached);
  const [isImageError, setIsImageError] = useState(false);

  // Skip the reset on the very first render — it would otherwise immediately
  // flip an assumeCached-optimized isImageLoading=false back to true on
  // mount, since effects always run at least once after the initial render.
  // Only a genuine source change afterward (e.g. this component instance
  // reused for a different image) should reset to the loading state.
  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
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

  // Chat bubbles specifically need the decoded bitmap to survive a component
  // unmount: leaving a chat and returning immediately (stack pop + push —
  // Expo Router destroys the popped screen, there's no sibling pane to hide
  // via opacity the way the feed's Campus/Community panes do) remounts
  // every message row from scratch, as does FlatList's own virtualization
  // (removeClippedSubviews + windowSize) recycling cells that scroll far
  // enough away. A disk-only cache still requires a fresh async read+decode
  // on every one of those remounts — cheap, but not free, and the resulting
  // gap is exactly the visible "reload flash" this fixes. memory-disk lets
  // expo-image's own bounded, LRU in-memory cache (not something this app
  // manages directly) serve an already-decoded bitmap instantly instead.
  // Every other mode (feed posts, gallery previews) is unaffected — same
  // "disk" policy as before.
  const cachePolicy = mode === "chatBubble" ? "memory-disk" : "disk";

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
          cachePolicy={cachePolicy}
          transition={IMAGE_TRANSITION_MS}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      ) : (
        <SupabaseImage
          path={source}
          bucket={bucket}
          version={version}
          style={imageStyle}
          contentFit={contentFit}
          contentPosition={contentPosition}
          loadingBackgroundColor={backgroundColor}
          transition={IMAGE_TRANSITION_MS}
          cachePolicy={cachePolicy}
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
