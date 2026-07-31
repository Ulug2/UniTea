import type { Database } from "../../types/database.types";
import type { BlockRecord } from "../../hooks/useBlocks";

type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];

/**
 * Minimal shape of a replied-to message embedded in a bubble.
 * Populated via a JOIN when fetching messages (reply_message alias).
 */
export type ReplyPreview = {
  id: string;
  content: string | null;
  image_url: string | null;
  user_id: string;
  deleted_by_sender?: boolean | null;
  deleted_by_receiver?: boolean | null;
};

/**
 * State held by the screen while the user has chosen a message to reply to.
 */
export type ReplyingToState = {
  message: ChatMessageVM;
  senderName: string;
};

export type ChatMessageVM = ChatMessageRow & {
  image_url?: string | null;
  sendStatus?: "sending" | "failed";
  _clientPayload?: {
    messageText: string;
    imageUrl?: string | null;
    localImageUri?: string | null;
    /** Picker-reported type metadata, preserved so a retried upload still resolves its type reliably instead of falling back to URI parsing. */
    localImageMimeType?: string | null;
    localImageFileName?: string | null;
    imageAspectRatio?: number | null;
    /** Preserved across retry so replies survive failed-send recovery. */
    replyToId?: string | null;
  } | null;
  /** FK to the original message being replied to (mirrors DB column). */
  reply_to_id?: string | null;
  /** Denormalised original message data, populated from JOIN or optimistic update. */
  replyToMessage?: ReplyPreview | null;
};

export type MessagesQueryData = {
  pages: ChatMessageVM[][];
  pageParams: number[];
};

export type DeleteAction = "delete_for_me" | "delete_for_everyone";

/**
 * True if the message should be hidden for the given viewer (delete for me).
 */
export function isDeletedForViewer(
  message: ChatMessageVM,
  viewerId: string
): boolean {
  const isSender = message.user_id === viewerId;
  if (isSender) return message.deleted_by_sender === true;
  return message.deleted_by_receiver === true;
}

/**
 * True when both sides have "deleted" (delete for everyone) — show tombstone.
 */
export function isDeletedForEveryone(message: ChatMessageVM): boolean {
  return (
    message.deleted_by_sender === true && message.deleted_by_receiver === true
  );
}

/**
 * Label for a deleted message (tombstone).
 */
export function deletedLabel(_message: ChatMessageVM): string {
  return "This message was deleted";
}

/**
 * Flatten infinite query pages and filter out messages from blocked users.
 * Scope must match the chat's own anonymity: anonymous_only blocks filter
 * anonymous chats, profile_only blocks filter non-anonymous chats — a
 * block placed in one context must never affect the other.
 */
export function selectMessages(
  messagesData: MessagesQueryData | undefined,
  blocks: BlockRecord[],
  isAnonymous: boolean
): ChatMessageVM[] {
  if (!messagesData) return [];
  const all = messagesData.pages.flat();
  if (blocks.length === 0) return all;
  const requiredScope = isAnonymous ? "anonymous_only" : "profile_only";
  const blockedIds = new Set(
    blocks.filter((b) => b.scope === requiredScope).map((b) => b.userId)
  );
  if (blockedIds.size === 0) return all;
  return all.filter((msg) => !blockedIds.has(msg.user_id));
}
