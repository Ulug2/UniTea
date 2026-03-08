import React, { useEffect } from "react";
import {
  Modal,
  Pressable,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { usePinchZoom } from "../hooks/usePinchZoom";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const fullScreenImageStyles = StyleSheet.create({
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
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});

type FullscreenImageModalProps = {
  visible: boolean;
  imagePath: string | null;
  onClose: () => void;
};

export function FullscreenImageModal({
  visible,
  imagePath,
  onClose,
}: FullscreenImageModalProps) {
  const { panResponder, animatedStyle, reset } = usePinchZoom(!!imagePath);

  useEffect(() => {
    if (imagePath) reset();
  }, [imagePath, reset]);

  // chat-images is a public bucket — construct the URL synchronously so expo-image
  // can serve it from the disk cache without a network round-trip.
  const imageUri =
    imagePath != null
      ? `${SUPABASE_URL}/storage/v1/object/public/chat-images/${imagePath}`
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={fullScreenImageStyles.overlay} onPress={onClose}>
        {imageUri != null && (
          <Animated.View
            style={[fullScreenImageStyles.imageWrap, animatedStyle]}
            {...panResponder.panHandlers}
          >
            <Image
              source={{ uri: imageUri }}
              style={fullScreenImageStyles.fullScreenImage}
              contentFit="contain"
              cachePolicy="disk"
            />
          </Animated.View>
        )}
      </Pressable>
    </Modal>
  );
}
