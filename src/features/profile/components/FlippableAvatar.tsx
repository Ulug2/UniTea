import React, { useEffect, useRef } from "react";
import { Animated, Image, PanResponder, StyleSheet, View } from "react-native";
import SupabaseImage from "../../../components/SupabaseImage";
import {
  DEFAULT_AVATAR,
  FOUNDING_FATHER_BADGE,
} from "../../../constants/images";
import type { Database } from "../../../types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type FlippableAvatarProps = {
  currentUser: Profile | null;
  onAvatarPress: () => void;
};

const AVATAR_SIZE = 120;
const SWIPE_THRESHOLD = 30;

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
      onMoveShouldSetPanResponder: (_, { dx }) => Math.abs(dx) > 5,
      onPanResponderRelease: (_, { dx, dy }) => {
        const isHorizontalSwipe = Math.abs(dx) > SWIPE_THRESHOLD;
        const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10;

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

  const avatarContent = currentUser?.avatar_url ? (
    currentUser.avatar_url.startsWith("http") ? (
      <Image
        source={{ uri: currentUser.avatar_url }}
        style={styles.faceImage}
      />
    ) : (
      <SupabaseImage
        path={currentUser.avatar_url}
        bucket="avatars"
        style={styles.faceImage}
      />
    )
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

      {/* Back face — Founding Father badge, only mounted for founding members */}
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
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  face: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
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
