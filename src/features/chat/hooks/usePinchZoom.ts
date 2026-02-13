import { useRef, useEffect } from "react";
import { Animated, PanResponder } from "react-native";

export function usePinchZoom(active: boolean) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(1);
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);
  const initialPinchDistance = useRef(0);
  const initialPinchCenter = useRef({ x: 0, y: 0 });

  const reset = () => {
    scaleAnim.setValue(1);
    translateXAnim.setValue(0);
    translateYAnim.setValue(0);
    baseScale.current = 1;
    baseTranslateX.current = 0;
    baseTranslateY.current = 0;
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
  };

  useEffect(() => {
    if (active) reset();
  }, [active, scaleAnim, translateXAnim, translateYAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.numberActiveTouches === 2,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          baseScale.current = lastScale.current;
          baseTranslateX.current = lastTranslateX.current;
          baseTranslateY.current = lastTranslateY.current;
          const a = touches[0];
          const b = touches[1];
          initialPinchDistance.current =
            Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
          initialPinchCenter.current = {
            x: (a.pageX + b.pageX) / 2,
            y: (a.pageY + b.pageY) / 2,
          };
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== 2) return;
        const a = touches[0];
        const b = touches[1];
        const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
        const centerX = (a.pageX + b.pageX) / 2;
        const centerY = (a.pageY + b.pageY) / 2;
        const scale = (baseScale.current * dist) / initialPinchDistance.current;
        const clampedScale = Math.max(0.5, Math.min(scale, 5));
        const tx =
          baseTranslateX.current + (centerX - initialPinchCenter.current.x);
        const ty =
          baseTranslateY.current + (centerY - initialPinchCenter.current.y);
        scaleAnim.setValue(clampedScale);
        translateXAnim.setValue(tx);
        translateYAnim.setValue(ty);
        lastScale.current = clampedScale;
        lastTranslateX.current = tx;
        lastTranslateY.current = ty;
      },
      onPanResponderRelease: () => {
        baseScale.current = lastScale.current;
        baseTranslateX.current = lastTranslateX.current;
        baseTranslateY.current = lastTranslateY.current;
      },
    })
  ).current;

  const animatedStyle = {
    transform: [
      { translateX: translateXAnim },
      { translateY: translateYAnim },
      { scale: scaleAnim },
    ],
  };

  return { panResponder, animatedStyle, reset };
}
