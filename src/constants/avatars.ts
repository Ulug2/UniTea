import type { FC } from "react";
import type { SvgProps } from "react-native-svg";
import StudentIcon from "../../assets/svg/student-thin-svgrepo-com.svg";
import PeopleIcon from "../../assets/svg/people-svgrepo-com.svg";

export const STUDENT_AVATAR_ICON: FC<SvgProps> = StudentIcon;
export const COMMUNITY_FALLBACK_ICON: FC<SvgProps> = PeopleIcon;

/** Default background for SVG avatar fallbacks (matches theme.primary). */
export const AVATAR_FALLBACK_BG = "#2FC9C1";

/** Icon tint for SVG fallback avatars rendered on AVATAR_FALLBACK_BG. */
export const SVG_AVATAR_ICON_COLOR = "#FFFFFF";

/** SVG icon size as a fraction of the avatar container width/height. */
export const SVG_AVATAR_ICON_SCALE = 0.825;
