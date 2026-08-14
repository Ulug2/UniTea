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
import { AVATAR_FALLBACK_BG, SVG_AVATAR_DARK_TONE } from "../constants/avatars";
import { useTheme } from "../context/ThemeContext";
import type { AvatarDescriptor } from "../utils/entityDisplay";

type EntityAvatarProps = {
  descriptor: AvatarDescriptor;
  style: StyleProp<ImageStyle>;
  /** Cache-busting token for a deterministic path overwritten in place — see SupabaseImage. */
  version?: string | number | null;
  onLoad?: () => void;
};

function EntityAvatar({ descriptor, style, version, onLoad }: EntityAvatarProps) {
  const { isDark, theme } = useTheme();
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
    descriptor.kind === "bundled" ? { backgroundColor: AVATAR_FALLBACK_BG } : null,
  ];

  switch (descriptor.kind) {
    case "remote":
      if (descriptor.bucket === "avatars") {
        return (
          <ExpoImage
            source={{ uri: getAvatarUri(descriptor.url, version ? String(version) : undefined) }}
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
          version={version}
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
      const { Icon } = descriptor;
      // Same grey as the unselected Hot/Recent/Top feed-sort icons
      // (theme.secondaryText) — not a separate hardcoded value, so it stays
      // in sync if that token ever changes. Light mode is dark mode's
      // scheme with the icon/background roles swapped: dark mode is a grey
      // backdrop with a dark icon, light mode is a dark backdrop with a
      // grey icon. The border is always the same grey, in both modes.
      const grey = theme.secondaryText;
      const iconColor = isDark ? SVG_AVATAR_DARK_TONE : grey;
      const backgroundColor = isDark ? grey : SVG_AVATAR_DARK_TONE;
      // Dark mode's border is the same grey as its background, so a
      // hairline is too thin to read as a border there — light mode
      // contrasts against a dark backdrop and stays hairline-thin.
      const borderWidth = isDark ? 1.5 : StyleSheet.hairlineWidth;
      return (
        <View
          style={[
            style,
            styles.svgContainer,
            { backgroundColor, borderWidth, borderColor: grey },
          ]}
        >
          <Icon width="100%" height="100%" color={iconColor} fill={iconColor} stroke={iconColor} />
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
    // Some callers (e.g. FlippableAvatar) apply their own circular
    // borderRadius + overflow:hidden on an OUTER wrapper and pass this
    // component an unrounded 100%-sized style. Without its own radius here,
    // a stroke border added below renders as a square ring that the outer
    // circular clip cuts away almost entirely (a circle only touches a
    // square's edges at 4 single points) — a large fixed radius forces this
    // view round on its own regardless of what the caller passed in, so the
    // border stays visible everywhere. Solid fills were unaffected by this
    // (a clipped square fill and a round fill look identical), which is why
    // only the bordered light-mode look exposed the bug.
    borderRadius: 9999,
  },
});
