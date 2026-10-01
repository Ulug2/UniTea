import React from "react";
import { Image, View } from "react-native";

// The existing UniTee wordmark: assets/splash-icon.png is 2048×2048, the
// wordmark (cap, "UniTee", leaves) drawn on a flat #2FC9C1 field — the same
// turquoise as the preview background, so a crop blends seamlessly. CROP is
// the wordmark's measured bounding box (x 188–1646, y 614–1154) padded by
// 16px so anti-aliased edges are never clipped.
const SOURCE = require("../../../../assets/splash-icon.png");
const SOURCE_SIZE = 2048;
const CROP = { x: 172, y: 598, width: 1490, height: 572 };

type UniTeeWordmarkProps = {
  width?: number;
};

export function UniTeeWordmark({ width = 220 }: UniTeeWordmarkProps) {
  const k = width / CROP.width;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="UniTee"
      testID="unitee-wordmark"
      style={{ width, height: CROP.height * k, overflow: "hidden" }}
    >
      <Image
        source={SOURCE}
        resizeMode="stretch"
        style={{
          position: "absolute",
          width: SOURCE_SIZE * k,
          height: SOURCE_SIZE * k,
          left: -CROP.x * k,
          top: -CROP.y * k,
        }}
      />
    </View>
  );
}
