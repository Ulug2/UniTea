import React, { useEffect } from "react";
import {
  Modal,
  Pressable,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { usePinchZoom } from "../features/chat/hooks/usePinchZoom";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrap: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
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
  const { panResponder, animatedStyle, reset } = usePinchZoom(!!uri);

  useEffect(() => {
    if (uri) reset();
  }, [uri, reset]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {uri != null && (
          <Animated.View
            style={[styles.imageWrap, animatedStyle]}
            {...panResponder.panHandlers}
          >
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
              cachePolicy="disk"
            />
          </Animated.View>
        )}
      </Pressable>
    </Modal>
  );
}

/**
 * Resolves a post image value to a full https:// URI.
 * - If it already starts with "http", returned as-is.
 * - Otherwise treated as a path in the public "post-images" bucket.
 */
export function resolvePostImageUri(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/post-images/${imageUrl}`;
}
