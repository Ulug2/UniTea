import React, { useEffect, useMemo, useRef } from "react";
import {
  Modal,
  View,
  Pressable,
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { AntDesign } from "@expo/vector-icons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MIN_SCALE = 1;
const MAX_SCALE = 5;

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
    top: 52,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
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
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const currentScale = useRef(1);
  const currentTranslateX = useRef(0);
  const currentTranslateY = useRef(0);

  const baseScale = useRef(1);
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);

  const pinchStartDistance = useRef(1);
  const pinchStartCenter = useRef({ x: 0, y: 0 });
  const lastTouchCount = useRef(0);

  const resetTransforms = () => {
    currentScale.current = 1;
    currentTranslateX.current = 0;
    currentTranslateY.current = 0;
    scaleAnim.setValue(1);
    translateXAnim.setValue(0);
    translateYAnim.setValue(0);
  };

  useEffect(() => {
    if (!uri) return;
    resetTransforms();
    lastTouchCount.current = 0;
  }, [uri, scaleAnim, translateXAnim, translateYAnim]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.numberActiveTouches >= 1,
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          gestureState.numberActiveTouches >= 1,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderStart: (evt) => {
          const touches = evt.nativeEvent.touches;
          const touchCount = touches.length;
          if (touchCount === 2 && lastTouchCount.current !== 2) {
            const a = touches[0];
            const b = touches[1];
            baseScale.current = currentScale.current;
            baseTranslateX.current = currentTranslateX.current;
            baseTranslateY.current = currentTranslateY.current;
            pinchStartDistance.current =
              Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
            pinchStartCenter.current = {
              x: (a.pageX + b.pageX) / 2,
              y: (a.pageY + b.pageY) / 2,
            };
          }
          lastTouchCount.current = touchCount;
        },
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          lastTouchCount.current = touches.length;
          baseScale.current = currentScale.current;
          baseTranslateX.current = currentTranslateX.current;
          baseTranslateY.current = currentTranslateY.current;

          if (touches.length === 2) {
            const a = touches[0];
            const b = touches[1];
            pinchStartDistance.current =
              Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
            pinchStartCenter.current = {
              x: (a.pageX + b.pageX) / 2,
              y: (a.pageY + b.pageY) / 2,
            };
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          const touchCount = touches.length;

          if (touchCount === 2 && lastTouchCount.current !== 2) {
            const a = touches[0];
            const b = touches[1];
            baseScale.current = currentScale.current;
            baseTranslateX.current = currentTranslateX.current;
            baseTranslateY.current = currentTranslateY.current;
            pinchStartDistance.current =
              Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
            pinchStartCenter.current = {
              x: (a.pageX + b.pageX) / 2,
              y: (a.pageY + b.pageY) / 2,
            };
            lastTouchCount.current = 2;
          }

          if (touchCount === 1 && lastTouchCount.current === 2) {
            baseTranslateX.current = currentTranslateX.current;
            baseTranslateY.current = currentTranslateY.current;
            baseScale.current = currentScale.current;
          }

          if (touchCount === 2) {
            const a = touches[0];
            const b = touches[1];
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
            const centerX = (a.pageX + b.pageX) / 2;
            const centerY = (a.pageY + b.pageY) / 2;

            const scale =
              (baseScale.current * dist) / pinchStartDistance.current;
            const clampedScale = Math.min(
              MAX_SCALE,
              Math.max(MIN_SCALE, scale),
            );

            const tx =
              baseTranslateX.current + (centerX - pinchStartCenter.current.x);
            const ty =
              baseTranslateY.current + (centerY - pinchStartCenter.current.y);

            currentScale.current = clampedScale;
            currentTranslateX.current = tx;
            currentTranslateY.current = ty;

            scaleAnim.setValue(clampedScale);
            translateXAnim.setValue(tx);
            translateYAnim.setValue(ty);
            lastTouchCount.current = touchCount;
            return;
          }

          // Pinch-only modal behavior: one-finger pan only when zoomed in.
          if (currentScale.current > 1.01) {
            const tx = baseTranslateX.current + gestureState.dx;
            const ty = baseTranslateY.current + gestureState.dy;
            currentTranslateX.current = tx;
            currentTranslateY.current = ty;
            translateXAnim.setValue(tx);
            translateYAnim.setValue(ty);
          }

          lastTouchCount.current = touchCount;
        },
        onPanResponderRelease: () => {
          lastTouchCount.current = 0;

          // If almost not zoomed, normalize image back to centered base state.
          if (currentScale.current < 1.02) {
            currentScale.current = 1;
            Animated.parallel([
              Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
              }),
              Animated.timing(translateXAnim, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
              }),
              Animated.timing(translateYAnim, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
              }),
            ]).start(() => {
              currentTranslateX.current = 0;
              currentTranslateY.current = 0;
            });
          }
        },
        onPanResponderTerminate: () => {
          lastTouchCount.current = 0;
          if (currentScale.current <= 1.01) resetTransforms();
        },
      }),
    [scaleAnim, translateXAnim, translateYAnim],
  );

  const animatedImageStyle = {
    transform: [
      { translateX: translateXAnim },
      { translateY: translateYAnim },
      { scale: scaleAnim },
    ],
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
          {uri != null && (
            <Animated.View
              style={[styles.imageWrapOuter, animatedImageStyle]}
              {...panResponder.panHandlers}
            >
              <View style={styles.imageWrapInner}>
                <Image
                  source={{ uri }}
                  style={styles.image}
                  contentFit="contain"
                  cachePolicy="disk"
                />
              </View>
            </Animated.View>
          )}
        </Pressable>

        <Pressable onPress={onClose} style={styles.closeButton} hitSlop={10}>
          <AntDesign name="close" size={20} color="#fff" />
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
