import React, { useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import SupabaseImage from "./SupabaseImage";
import { getAvatarUri } from "../utils/avatarUri";
import {
  AVATAR_FALLBACK_BG,
  SVG_AVATAR_ICON_COLOR,
  SVG_AVATAR_ICON_SCALE,
} from "../constants/avatars";
import type { AvatarDescriptor } from "../utils/entityDisplay";

type EntityAvatarProps = {
  descriptor: AvatarDescriptor;
  style: StyleProp<ImageStyle>;
  onLoad?: () => void;
};

function EntityAvatar({ descriptor, style, onLoad }: EntityAvatarProps) {
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const size =
    typeof flatStyle.width === "number"
      ? flatStyle.width
      : typeof flatStyle.height === "number"
        ? flatStyle.height
        : 40;

  const handleLoad = useCallback(() => {
    onLoad?.();
  }, [onLoad]);

  useEffect(() => {
    if (descriptor.kind === "svg" || descriptor.kind === "bundled") {
      handleLoad();
    }
  }, [descriptor, handleLoad]);

  const shellStyle = [
    style,
    styles.shell,
    descriptor.kind === "svg" ? { backgroundColor: descriptor.backgroundColor } : null,
    descriptor.kind === "bundled" ? { backgroundColor: AVATAR_FALLBACK_BG } : null,
  ];

  switch (descriptor.kind) {
    case "remote":
      if (descriptor.bucket === "avatars") {
        return (
          <ExpoImage
            source={{ uri: getAvatarUri(descriptor.url) }}
            style={style}
            contentFit="cover"
            cachePolicy="disk"
            transition={0}
            onLoad={handleLoad}
          />
        );
      }
      return (
        <SupabaseImage
          path={descriptor.url}
          bucket={descriptor.bucket}
          style={style}
          onLoad={handleLoad}
        />
      );

    case "bundled":
      return (
        <View style={shellStyle}>
          <ExpoImage
            source={descriptor.source}
            style={styles.fill}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            onLoad={handleLoad}
          />
        </View>
      );

    case "svg": {
      const { Icon, backgroundColor } = descriptor;
      const iconSize = Math.round(size * SVG_AVATAR_ICON_SCALE);
      return (
        <View style={[style, styles.svgContainer, { backgroundColor }]}>
          <Icon
            width={iconSize}
            height={iconSize}
            color={SVG_AVATAR_ICON_COLOR}
            fill={SVG_AVATAR_ICON_COLOR}
            stroke={SVG_AVATAR_ICON_COLOR}
          />
        </View>
      );
    }
  }
}

export default React.memo(EntityAvatar);

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
  },
  fill: {
    width: "100%",
    height: "100%",
  },
  svgContainer: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});
