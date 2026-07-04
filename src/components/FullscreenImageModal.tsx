import React from "react";
import { Modal, View, Pressable, Dimensions, StyleSheet } from "react-native";
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
  onClose,
}: FullscreenImageModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.overlay} onPress={onClose}>
          {uri != null && (
            // Keyed on uri so a new image always mounts a fresh PinchToZoom
            // instance — no leftover zoom/translate state from the last image.
            <PinchToZoom key={uri} style={styles.imageWrapOuter}>
              <View style={styles.imageWrapInner}>
                <Image
                  source={{ uri }}
                  style={styles.image}
                  contentFit="contain"
                  cachePolicy="disk"
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
