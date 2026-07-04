import React from "react";
import { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const DEFAULT_MIN_SCALE = 1;
const DEFAULT_MAX_SCALE = 5;
const RESET_DURATION_MS = 200;

type PinchToZoomProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  minScale?: number;
  maxScale?: number;
};

/**
 * Wraps its children with native-feeling pinch-to-zoom, shared across every
 * image viewer in the app.
 *
 * The zoom anchors to the midpoint between the two fingers (like the iOS/
 * Android Photos app) rather than the view's center, and that anchor is
 * re-measured every frame so it tracks finger movement mid-gesture. On
 * release it always animates back to scale 1 / no translation — there is no
 * persisted zoom state, so every new pinch starts from the untransformed
 * image.
 */
export function PinchToZoom({
  children,
  style,
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
}: PinchToZoomProps) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Focal point at gesture start, in the wrapper's local coordinate space —
  // the anchor the whole gesture's translation is computed relative to.
  const origin = useSharedValue({ x: 0, y: 0 });
  const containerSize = useSharedValue({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    containerSize.value = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    };
  };

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      origin.value = { x: e.focalX, y: e.focalY };
    })
    .onUpdate((e) => {
      const clampedScale = Math.min(maxScale, Math.max(minScale, e.scale));
      scale.value = clampedScale;

      const cx = containerSize.value.width / 2;
      const cy = containerSize.value.height / 2;

      // Scaling happens around the wrapper's own center, so the original
      // focal point (origin) would otherwise drift by (origin - center) *
      // (scale - 1). We cancel that drift, then add the focal point's own
      // movement since gesture start (e.focalX - origin.x) so the anchor
      // keeps tracking the fingers as they move, not just where they began.
      translateX.value =
        e.focalX - origin.value.x + (origin.value.x - cx) * (1 - clampedScale);
      translateY.value =
        e.focalY - origin.value.y + (origin.value.y - cy) * (1 - clampedScale);
    })
    .onEnd(() => {
      scale.value = withTiming(1, { duration: RESET_DURATION_MS });
      translateX.value = withTiming(0, { duration: RESET_DURATION_MS });
      translateY.value = withTiming(0, { duration: RESET_DURATION_MS });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={pinchGesture}>
      <Animated.View style={[style, animatedStyle]} onLayout={onLayout}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
