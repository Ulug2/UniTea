import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Image } from "react-native";
import { moderateScale } from "../utils/scaling";

/**
 * Keep JS overlay size aligned with Android native splash layers to avoid
 * visible size jumps while app content is fading in.
 */
const LOGO_SIZE = moderateScale(268);
const ANDROID_SPLASH = require("../../assets/splash-logo-android.png");

interface SplashOverlayProps {
  /** When flipped to false the overlay fades out and unmounts itself. */
  visible: boolean;
  /** Called once when the splash image is guaranteed drawable. */
  onAssetReady?: () => void;
}

export function SplashOverlay({ visible, onAssetReady }: SplashOverlayProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [hidden, setHidden] = useState(false);
  const didNotifyReady = useRef(false);

  const notifyReady = () => {
    if (!didNotifyReady.current) {
      didNotifyReady.current = true;
      onAssetReady?.();
    }
  };

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setHidden(true);
      });
    }
  }, [visible, opacity]);

  // Fallback: if onLoadEnd is delayed, still mark ready on next frame.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const id = requestAnimationFrame(() => {
      notifyReady();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // iOS should use only native storyboard splash + app theme transition.
  if (Platform.OS !== "android") return null;
  if (hidden) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents="none"
    >
      <Image
        source={ANDROID_SPLASH}
        defaultSource={ANDROID_SPLASH}
        style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
        resizeMode="contain"
        fadeDuration={0}
        onLoadEnd={notifyReady}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    backgroundColor: "#2FC9C1",
    justifyContent: "center",
    alignItems: "center",
  },
});
