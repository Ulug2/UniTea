import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  View,
  Pressable,
  Dimensions,
  StyleSheet,
  Text,
} from "react-native";
import { Image } from "expo-image";
import { AntDesign } from "@expo/vector-icons";
import { PinchToZoom } from "./PinchToZoom";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrapOuter: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrapInner: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#fff",
    fontSize: moderateScale(15),
    marginBottom: verticalScale(12),
  },
  retryButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(18),
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  retryText: {
    color: "#fff",
    fontSize: moderateScale(15),
    fontWeight: "600",
  },
  closeButton: {
    position: "absolute",
    top: verticalScale(52),
    right: scale(20),
    width: scale(40),
    height: verticalScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});

type FullscreenImageModalProps = {
  visible: boolean;
  /** Fully-resolved https:// URI. Pass null to hide. */
  uri: string | null;
  /** Stable expo-image cache key (e.g. for signed URLs whose token changes). */
  cacheKey?: string;
  /** The URI is still being resolved (e.g. signing) — shows a spinner. */
  isResolving?: boolean;
  /** Resolving the URI failed — shows the error state. */
  resolveFailed?: boolean;
  /** Called on "Retry" in addition to reloading the image. */
  onRetry?: () => void;
  onClose: () => void;
};

/**
 * Generic full-screen image viewer with pinch-to-zoom.
 * Uses expo-image so the image is served instantly from the same disk cache
 * already populated by SupabaseImage in the feed/detail screens.
 */
export function FullscreenImageModal({
  visible,
  uri,
  cacheKey,
  isResolving = false,
  resolveFailed = false,
  onRetry,
  onClose,
}: FullscreenImageModalProps) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setHasLoadError(false);
  }, [uri]);

  const showError = resolveFailed || hasLoadError;
  const handleRetry = () => {
    setHasLoadError(false);
    setAttempt((n) => n + 1);
    onRetry?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.overlay} onPress={onClose}>
          {/* Behind the image: visible until the image draws over it, so an
              already-cached image never flashes a spinner. */}
          {!showError && (uri != null || isResolving) && (
            <View style={styles.centerOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
          {showError && (
            <View style={styles.centerOverlay}>
              <Text style={styles.errorText}>Couldn't load image</Text>
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
          {uri != null && !showError && (
            // Keyed on uri so a new image always mounts a fresh PinchToZoom
            // instance — no leftover zoom/translate state from the last image.
            <PinchToZoom key={`${uri}#${attempt}`} style={styles.imageWrapOuter}>
              <View style={styles.imageWrapInner}>
                <Image
                  source={{ uri, cacheKey }}
                  style={styles.image}
                  contentFit="contain"
                  cachePolicy="disk"
                  onError={() => setHasLoadError(true)}
                />
              </View>
            </PinchToZoom>
          )}
        </Pressable>

        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={moderateScale(10)}
        >
          <AntDesign name="close" size={moderateScale(20)} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * Resolves a post image value to a full https:// URI.
 * - If it already starts with "http", returned as-is.
 * - Otherwise treated as a path in the public "post-images" bucket.
 */
export function resolvePostImageUri(
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  // In the create-post flow we may already have local URIs (e.g. file://...).
  // expo-image can load these directly, so don't rewrite them to Supabase URLs.
  if (
    imageUrl.startsWith("file://") ||
    imageUrl.startsWith("content://") ||
    imageUrl.startsWith("data:")
  ) {
    return imageUrl;
  }
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/post-images/${imageUrl}`;
}
