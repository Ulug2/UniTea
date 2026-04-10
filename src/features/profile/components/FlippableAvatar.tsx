import React, { useEffect, useRef } from "react";
import { Animated, Image, PanResponder, StyleSheet, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import {
  DEFAULT_AVATAR,
  FOUNDING_FATHER_BADGE,
} from "../../../constants/images";
import type { Database } from "../../../types/database.types";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type FlippableAvatarProps = {
  currentUser: Profile | null;
  onAvatarPress: () => void;
};

const AVATAR_WIDTH = scale(120);
const AVATAR_HEIGHT = verticalScale(120);
const AVATAR_RADIUS = moderateScale(60);
const SWIPE_THRESHOLD = scale(30);
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

/**
 * Returns a fully-qualified URL for the avatar, constructing the public
 * storage URL synchronously for Supabase storage paths. This bypasses
 * SupabaseImage's async state so there is never a loading spinner.
 */
function getAvatarUri(avatarUrl: string): string {
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarUrl}`;
}

export function FlippableAvatar({
  currentUser,
  onAvatarPress,
}: FlippableAvatarProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const isFlippedRef = useRef(false);

  // Refs keep PanResponder callbacks fresh without recreating the responder.
  const isFoundingMemberRef = useRef(currentUser?.is_founding_member === true);
  const onAvatarPressRef = useRef(onAvatarPress);

  useEffect(() => {
    isFoundingMemberRef.current = currentUser?.is_founding_member === true;
  }, [currentUser?.is_founding_member]);

  useEffect(() => {
    onAvatarPressRef.current = onAvatarPress;
  }, [onAvatarPress]);

  const flip = () => {
    const toValue = isFlippedRef.current ? 0 : 180;
    isFlippedRef.current = !isFlippedRef.current;
    Animated.spring(animatedValue, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dx }) => Math.abs(dx) > scale(5),
      onPanResponderRelease: (_, { dx, dy }) => {
        const isHorizontalSwipe = Math.abs(dx) > SWIPE_THRESHOLD;
        const isTap = Math.abs(dx) < scale(10) && Math.abs(dy) < verticalScale(10);

        if (isHorizontalSwipe && isFoundingMemberRef.current) {
          flip();
        } else if (isTap) {
          onAvatarPressRef.current();
        }
      },
    }),
  ).current;

  // Interpolated rotations for the two faces.
  const frontRotation = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });
  const backRotation = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });

  // Snap-hide each face exactly at the halfway point so neither bleeds through.
  const frontOpacity = animatedValue.interpolate({
    inputRange: [89, 90],
    outputRange: [1, 0],
  });
  const backOpacity = animatedValue.interpolate({
    inputRange: [89, 90],
    outputRange: [0, 1],
  });

  // Pre-construct the URL synchronously — ExpoImage + disk cache means no
  // loading state, no spinner, and the image renders on the very first frame.
  const avatarContent = currentUser?.avatar_url ? (
    <ExpoImage
      source={{ uri: getAvatarUri(currentUser.avatar_url) }}
      contentFit="cover"
      cachePolicy="disk"
      style={styles.faceImage}
    />
  ) : (
    <Image source={DEFAULT_AVATAR} style={styles.faceImage} />
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Front face — avatar */}
      <Animated.View
        style={[
          styles.face,
          {
            opacity: frontOpacity,
            transform: [{ perspective: 1000 }, { rotateY: frontRotation }],
          },
        ]}
      >
        {avatarContent}
      </Animated.View>

      {/* Back face — Founding Member badge, only mounted for founding members */}
      {currentUser?.is_founding_member === true && (
        <Animated.View
          style={[
            styles.face,
            styles.backFace,
            {
              opacity: backOpacity,
              transform: [{ perspective: 1000 }, { rotateY: backRotation }],
            },
          ]}
        >
          <Image
            source={FOUNDING_FATHER_BADGE}
            style={styles.faceImage}
            resizeMode="cover"
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: AVATAR_WIDTH,
    height: AVATAR_HEIGHT,
  },
  face: {
    width: AVATAR_WIDTH,
    height: AVATAR_HEIGHT,
    borderRadius: AVATAR_RADIUS,
    overflow: "hidden",
    backfaceVisibility: "hidden",
  },
  backFace: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  faceImage: {
    width: "100%",
    height: "100%",
  },
});
