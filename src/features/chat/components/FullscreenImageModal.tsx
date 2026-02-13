import React, { useEffect } from "react";
import {
  Modal,
  Pressable,
  Image,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { usePinchZoom } from "../hooks/usePinchZoom";
import { supabase } from "../../../lib/supabase";

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

  const imageUri =
    imagePath != null
      ? supabase.storage.from("chat-images").getPublicUrl(imagePath).data
          .publicUrl
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
              resizeMode="contain"
            />
          </Animated.View>
        )}
      </Pressable>
    </Modal>
  );
}
