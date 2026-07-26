import { hashStringToNumber } from "./anon";

export type ChatIdentity = {
  displayName: string;
  isAnonymousChat: boolean;
};

/**
 * Safely derives the counterpart's id and whether the chat is anonymous
 * from a two-participant chat/chat-summary row.
 *
 * chat.is_anonymous is checked first and short-circuits before
 * otherUserId is ever dereferenced: for anonymous chats,
 * chats_view/user_chats_summary null out the counterpart's participant
 * column by design, so any check on otherUserId's *value* (e.g. a legacy
 * "anonymous-..." fake-id prefix convention) must never run first, or it
 * throws on null. The legacy check is kept as a fallback only, for any
 * pre-`is_anonymous`-column rows that might still use that convention.
 */
export function resolveOtherParticipant(
  chat: {
    participant_1_id?: string | null;
    participant_2_id?: string | null;
    is_anonymous?: boolean | null;
  },
  currentUserId: string | undefined,
): { otherUserId: string | null; isAnonymous: boolean } {
  const otherUserId =
    (chat.participant_1_id === currentUserId
      ? chat.participant_2_id
      : chat.participant_1_id) ?? null;

  const isAnonymous =
    chat.is_anonymous === true || otherUserId?.startsWith("anonymous-") === true;

  return { otherUserId: isAnonymous ? null : otherUserId, isAnonymous };
}

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
      isAnonymousChat: false,
    };
  }

  if (currentUserId && currentUserId === chat.initiator_id) {
    return {
      displayName: "Them",
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
    isAnonymousChat: true,
  };
}
