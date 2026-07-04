import { moderateScale, scale, verticalScale } from "./scaling";

// Approximate WhatsApp chat-image bubble bounds: a bounding box narrower than
// the screen (leaving room for the surrounding bubble chrome/timestamp), with
// a floor so small/square images still get a comfortable tap target. Max
// bounds are fractions of the CURRENT screen size (passed in per-call, not
// cached) so they stay correct across rotation/window-size changes. Min
// bounds are fixed, density-scaled footprints — they don't need to track
// screen size the way the max bounds do.
const MAX_WIDTH_RATIO = 0.68;
const MAX_HEIGHT_RATIO = 0.45;
const MIN_WIDTH = scale(140);
const MIN_HEIGHT = verticalScale(140);

export type ChatImageDimensions = { width: number; height: number };
export type ChatImageBounds = {
  maxWidth: number;
  maxHeight: number;
  minWidth: number;
  minHeight: number;
};

/** Derives the bounding box from the *current* screen size — call this with
 * live values (e.g. from useWindowDimensions()) rather than a cached snapshot,
 * so it's correct after rotation. */
export function getChatImageBounds(
  screenWidth: number,
  screenHeight: number,
): ChatImageBounds {
  return {
    maxWidth: screenWidth * MAX_WIDTH_RATIO,
    maxHeight: screenHeight * MAX_HEIGHT_RATIO,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  };
}

/**
 * Fits an image's aspect ratio into the WhatsApp-style chat bubble bounding
 * box, always preserving aspect ratio (never stretches/distorts).
 *
 * Max width/height are a hard ceiling — the result never exceeds them, by
 * construction. The minimums are a best-effort floor: they're only applied
 * when doing so doesn't push the *other* axis past its max. For an extreme
 * aspect ratio (a long screenshot or a wide panorama) where honoring the
 * minimum on one axis would overflow the max on the other, the max bound
 * wins and the image is allowed to fall below the minimum on the short axis
 * — a thin sliver, rather than ever growing past the screen.
 */
export function getChatImageDimensions(
  aspectRatio: number | null | undefined,
  screenWidth: number,
  screenHeight: number,
): ChatImageDimensions {
  const ratio =
    typeof aspectRatio === "number" && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : 4 / 3;

  const { maxWidth, maxHeight, minWidth, minHeight } = getChatImageBounds(
    screenWidth,
    screenHeight,
  );

  // 1. Contain-fit into the max box. This alone guarantees width <= maxWidth
  //    and height <= maxHeight, regardless of how extreme the ratio is.
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  // 2. Try to raise a too-small width toward the minimum, but only if doing
  //    so keeps height within its max — otherwise leave it (extreme ratio).
  if (width < minWidth) {
    const candidateWidth = Math.min(minWidth, maxWidth);
    const candidateHeight = candidateWidth / ratio;
    if (candidateHeight <= maxHeight) {
      width = candidateWidth;
      height = candidateHeight;
    }
  }

  // 3. Same for height, guarded against overflowing maxWidth.
  if (height < minHeight) {
    const candidateHeight = Math.min(minHeight, maxHeight);
    const candidateWidth = candidateHeight * ratio;
    if (candidateWidth <= maxWidth) {
      height = candidateHeight;
      width = candidateWidth;
    }
  }

  return { width, height };
}

// Re-exported so callers don't need a second import just for a border radius
// that visually matches the rest of the chat bubble system.
export const CHAT_IMAGE_BORDER_RADIUS = moderateScale(12);
