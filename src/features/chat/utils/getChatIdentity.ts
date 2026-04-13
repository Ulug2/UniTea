import { hashStringToNumber } from "./anon";
import { DEFAULT_AVATAR } from "../../../constants/images";
import type { ImageSourcePropType } from "react-native";

export type ChatIdentity = {
  displayName: string;
  avatarSource: ImageSourcePropType | null;
  isAnonymousChat: boolean;
};

/**
 * Resolves the display name and avatar for the "other" user in a chat,
 * respecting pseudo-anonymous masking rules:
 *
 * - Non-anonymous chat: real profile name + avatar.
 * - Anonymous chat, viewer is the initiator (sender): "Them" + default avatar.
 * - Anonymous chat, viewer is the post author: "Anonymous User #XXXX" + default avatar.
 */
export function getChatDisplayIdentity(
  chat: {
    id?: string | null;
    chat_id?: string | null;
    created_at?: string | null;
    is_anonymous?: boolean | null;
    initiator_id?: string | null;
  },
  currentUserId: string | undefined,
  otherUserProfile: {
    username?: string | null;
    avatar_url?: string | null;
  } | null,
): ChatIdentity {
  if (!chat.is_anonymous) {
    return {
      displayName: otherUserProfile?.username || "Unknown User",
      avatarSource: null,
      isAnonymousChat: false,
    };
  }

  if (currentUserId && currentUserId === chat.initiator_id) {
    return {
      displayName: "Them",
      avatarSource: DEFAULT_AVATAR,
      isAnonymousChat: true,
    };
  }

  // Privacy hardening: alias is scoped to a single chat so the same person
  // cannot be linked across different anonymous conversations.
  const aliasSeed =
    chat.chat_id ??
    chat.id ??
    `${chat.created_at ?? ""}:${chat.initiator_id ?? ""}`;

  const hash = aliasSeed
    ? hashStringToNumber(aliasSeed)
    : 0;

  return {
    displayName: `Anonymous User #${hash}`,
    avatarSource: DEFAULT_AVATAR,
    isAnonymousChat: true,
  };
}
