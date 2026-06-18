import React from "react";
import {
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import EntityAvatar from "./EntityAvatar";
import { getAvatarForEntity } from "../utils/entityDisplay";
import { getAvatarUri } from "../utils/avatarUri";

type CachedAvatarProps = {
  avatarUrl?: string | null;
  style: StyleProp<ImageStyle>;
  onLoad?: () => void;
};

const studentFallback = getAvatarForEntity("student", {});

/**
 * Avatar tuned for list screens: builds the public storage URL synchronously
 * and renders via expo-image disk cache with no fade transition, matching the
 * profile tab's always-there avatar behavior.
 */
function CachedAvatar({
  avatarUrl,
  style,
  onLoad,
}: CachedAvatarProps) {
  if (!avatarUrl) {
    return (
      <EntityAvatar
        descriptor={studentFallback}
        style={style}
        onLoad={onLoad}
      />
    );
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
