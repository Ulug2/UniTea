import type { ImageSourcePropType } from "react-native";
import { Asset } from "expo-asset";

export type UniversityBranding = {
  displayName: string;
  avatar: ImageSourcePropType;
};

const NU_AVATAR = require("../../assets/images/nu_avatar.jpg");
const SDU_AVATAR = require("../../assets/images/sdu_avatar.jpg");

export const UNIVERSITY_BRANDING: Record<string, UniversityBranding> = {
  "nu.edu.kz": {
    displayName: "Nazarbayev",
    avatar: NU_AVATAR,
  },
  "stu.sdu.edu.kz": {
    displayName: "Suleiman Demirel",
    avatar: SDU_AVATAR,
  },
};

const UNIVERSITY_AVATAR_ASSETS = Object.values(UNIVERSITY_BRANDING).map(
  (entry) => entry.avatar,
);

let preloadPromise: Promise<void> | null = null;

/** Warm bundled university avatars into memory before first render needs them. */
export function preloadUniversityAvatars(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Asset.loadAsync(UNIVERSITY_AVATAR_ASSETS).then(() => undefined);
  }
  return preloadPromise;
}

export function getUniversityBranding(
  domain: string | null | undefined,
): UniversityBranding | null {
  if (!domain) return null;
  return UNIVERSITY_BRANDING[domain] ?? null;
}
