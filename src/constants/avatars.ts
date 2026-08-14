import type { FC } from "react";
import type { SvgProps } from "react-native-svg";
import StudentIcon from "../../assets/svg/default-avatar.svg";
import PeopleIcon from "../../assets/svg/default-community-avatar.svg";

export const STUDENT_AVATAR_ICON: FC<SvgProps> = StudentIcon;
export const COMMUNITY_FALLBACK_ICON: FC<SvgProps> = PeopleIcon;

/** Background for the anonymous-post toggle chip (unrelated to the SVG avatars themselves, which are self-colored). */
export const AVATAR_FALLBACK_BG = "#2FC9C1";

/**
 * The dark tone in the default SVG avatar's two-tone scheme — dark mode's
 * icon color and light mode's background color (the two modes swap which
 * role this plays; see EntityAvatar's "svg" case). The grey counterpart is
 * theme.secondaryText itself, not a separate constant here, since it's
 * already theme-reactive.
 */
export const SVG_AVATAR_DARK_TONE = "#0F1419";
