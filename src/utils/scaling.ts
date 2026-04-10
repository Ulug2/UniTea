import { Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

// Baseline dimensions for iPhone 15 Plus
const guidelineBaseWidth = 430;
const guidelineBaseHeight = 932;

/** Horizontal scale; fixed at module load (no rotation refresh). */
export const scale = (size: number): number =>
  (width / guidelineBaseWidth) * size;

/** Vertical scale; fixed at module load (no rotation refresh). */
export const verticalScale = (size: number): number =>
  (height / guidelineBaseHeight) * size;

export const moderateScale = (size: number, factor = 0.5): number =>
  size + (scale(size) - size) * factor;
