import React from "react";
import {
  Image,
  type ImageSourcePropType,
  type StyleProp,
  type ImageStyle,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { DEFAULT_AVATAR } from "../constants/images";
import { getAvatarUri } from "../utils/avatarUri";

type CachedAvatarProps = {
  avatarUrl?: string | null;
  style: StyleProp<ImageStyle>;
  onLoad?: () => void;
  fallback?: ImageSourcePropType;
};

/**
 * Avatar tuned for list screens: builds the public storage URL synchronously
 * and renders via expo-image disk cache with no fade transition, matching the
 * profile tab's always-there avatar behavior.
 */
function CachedAvatar({
  avatarUrl,
  style,
  onLoad,
  fallback = DEFAULT_AVATAR,
}: CachedAvatarProps) {
  if (!avatarUrl) {
    return <Image source={fallback} style={style} onLoad={onLoad} />;
  }

  return (
    <ExpoImage
      source={{ uri: getAvatarUri(avatarUrl) }}
      style={style}
      contentFit="cover"
      cachePolicy="disk"
      transition={0}
      onLoad={onLoad}
    />
  );
}

export default React.memo(CachedAvatar);
