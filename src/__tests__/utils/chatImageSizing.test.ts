/**
 * Tests for src/utils/chatImageSizing.ts
 *
 * getChatImageDimensions fits an image's aspect ratio into a WhatsApp-style
 * min/max bounding box, always preserving aspect ratio exactly, and never
 * exceeding the max bounds derived from the *current* screen size — even for
 * extreme aspect ratios (long screenshots, panoramas) where the minimum
 * footprint can't be honored on both axes at once.
 */
import {
  getChatImageDimensions,
  getChatImageBounds,
} from '../../utils/chatImageSizing';

const RATIO_TOLERANCE = 0.001;

// Representative screen sizes to prove sizing adapts to device/orientation
// rather than being baked in at module load.
const PHONE_PORTRAIT = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const SMALL_PHONE = { width: 320, height: 568 };
const TABLET = { width: 1024, height: 1366 };

describe('getChatImageDimensions', () => {
  it('preserves aspect ratio exactly for a landscape image', () => {
    const { width, height } = getChatImageDimensions(16 / 9, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(width / height).toBeCloseTo(16 / 9, 3);
  });

  it('preserves aspect ratio exactly for a portrait image', () => {
    const { width, height } = getChatImageDimensions(9 / 16, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(width / height).toBeCloseTo(9 / 16, 3);
  });

  it('preserves aspect ratio exactly for a square image', () => {
    const { width, height } = getChatImageDimensions(1, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(width / height).toBeCloseTo(1, 3);
  });

  it('never exceeds max width/height for a typical landscape photo', () => {
    const bounds = getChatImageBounds(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const { width, height } = getChatImageDimensions(4 / 3, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(width).toBeLessThanOrEqual(bounds.maxWidth + RATIO_TOLERANCE);
    expect(height).toBeLessThanOrEqual(bounds.maxHeight + RATIO_TOLERANCE);
  });

  it('never exceeds max width/height for a typical portrait photo', () => {
    const bounds = getChatImageBounds(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const { width, height } = getChatImageDimensions(3 / 4, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(width).toBeLessThanOrEqual(bounds.maxWidth + RATIO_TOLERANCE);
    expect(height).toBeLessThanOrEqual(bounds.maxHeight + RATIO_TOLERANCE);
  });

  it('enforces the minimum footprint for a tiny/square image', () => {
    const bounds = getChatImageBounds(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const { width, height } = getChatImageDimensions(1, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(width).toBeGreaterThanOrEqual(bounds.minWidth - RATIO_TOLERANCE);
    expect(height).toBeGreaterThanOrEqual(bounds.minHeight - RATIO_TOLERANCE);
  });

  // Regression tests for the actual bug report: a long screenshot or a wide
  // panorama used to blow past the max bound because the minimum-width/
  // minimum-height floor was applied without re-checking the max on the
  // other axis. The max bound must always win.
  it('never exceeds maxHeight for an extremely tall long-screenshot ratio, even below minWidth', () => {
    const bounds = getChatImageBounds(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const extremeRatio = 0.12; // e.g. a long portrait screenshot
    const { width, height } = getChatImageDimensions(extremeRatio, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(height).toBeLessThanOrEqual(bounds.maxHeight + RATIO_TOLERANCE);
    expect(width).toBeLessThanOrEqual(bounds.maxWidth + RATIO_TOLERANCE);
    expect(width / height).toBeCloseTo(extremeRatio, 3);
    // The minimum floor is a best-effort, not a guarantee — it's correct for
    // width to end up below minWidth here since honoring it would overflow.
  });

  it('never exceeds maxWidth for an extreme wide panorama ratio, even below minHeight', () => {
    const bounds = getChatImageBounds(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const extremeRatio = 5; // very wide panorama
    const { width, height } = getChatImageDimensions(extremeRatio, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(width).toBeLessThanOrEqual(bounds.maxWidth + RATIO_TOLERANCE);
    expect(height).toBeLessThanOrEqual(bounds.maxHeight + RATIO_TOLERANCE);
    expect(width / height).toBeCloseTo(extremeRatio, 3);
  });

  it('never exceeds bounds across a sweep of aspect ratios from extremely tall to extremely wide', () => {
    const bounds = getChatImageBounds(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const ratios = [0.02, 0.1, 0.2, 0.5, 0.75, 1, 1.33, 1.77, 2, 5, 10, 50];
    for (const ratio of ratios) {
      const { width, height } = getChatImageDimensions(ratio, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
      expect(width).toBeLessThanOrEqual(bounds.maxWidth + RATIO_TOLERANCE);
      expect(height).toBeLessThanOrEqual(bounds.maxHeight + RATIO_TOLERANCE);
      expect(width / height).toBeCloseTo(ratio, 2);
    }
  });

  it('falls back to a sane default ratio for invalid input', () => {
    const args: [number, number] = [PHONE_PORTRAIT.width, PHONE_PORTRAIT.height];
    const fallback = getChatImageDimensions(null, ...args);
    const zero = getChatImageDimensions(0, ...args);
    const negative = getChatImageDimensions(-2, ...args);
    const nan = getChatImageDimensions(NaN, ...args);
    for (const { width, height } of [fallback, zero, negative, nan]) {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(Number.isFinite(width)).toBe(true);
      expect(Number.isFinite(height)).toBe(true);
    }
  });

  it('is deterministic — same input always produces the same output', () => {
    const a = getChatImageDimensions(1.77, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const b = getChatImageDimensions(1.77, PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    expect(a).toEqual(b);
  });

  // Adapts to device size / orientation rather than a cached snapshot.
  it('produces different (larger) bounds on a tablet than on a small phone', () => {
    const smallPhoneBounds = getChatImageBounds(SMALL_PHONE.width, SMALL_PHONE.height);
    const tabletBounds = getChatImageBounds(TABLET.width, TABLET.height);
    expect(tabletBounds.maxWidth).toBeGreaterThan(smallPhoneBounds.maxWidth);
    expect(tabletBounds.maxHeight).toBeGreaterThan(smallPhoneBounds.maxHeight);
  });

  it('recomputes bounds after a simulated rotation (portrait vs landscape)', () => {
    const portraitBounds = getChatImageBounds(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const landscapeBounds = getChatImageBounds(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height);
    expect(landscapeBounds.maxWidth).toBeGreaterThan(portraitBounds.maxWidth);
    expect(landscapeBounds.maxHeight).toBeLessThan(portraitBounds.maxHeight);

    // A wide image should never exceed the landscape screen's max bounds
    // even though those bounds are wider than portrait's.
    const { width, height } = getChatImageDimensions(2.5, PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height);
    expect(width).toBeLessThanOrEqual(landscapeBounds.maxWidth + RATIO_TOLERANCE);
    expect(height).toBeLessThanOrEqual(landscapeBounds.maxHeight + RATIO_TOLERANCE);
  });
});
