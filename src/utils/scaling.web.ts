/**
 * Web fallback for scaling.ts. The native helpers scale against the device
 * window measured at module load, which on a desktop browser (e.g. 1440px
 * wide) would blow every size up ~3x. Web is only used by the read-only post
 * card preview (src/app/preview/post-card.tsx), which renders at the native
 * baseline width (430pt, iPhone 15 Plus), so sizes pass through unscaled —
 * exactly what the native helpers return on a baseline-sized device.
 */
export const scale = (size: number): number => size;

export const verticalScale = (size: number): number => size;

export const moderateScale = (size: number, _factor = 0.5): number => size;
