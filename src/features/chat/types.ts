import type { Database } from "../../types/database.types";
import type { BlockRecord } from "../../hooks/useBlocks";

type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];

export const MAX_CHAT_IMAGES = 3;

/** An image picked (and compressed) in the composer, not yet uploaded. */
export type PickedChatImage = {
  localUri: string;
  /** Picker-reported type metadata — most reliable source for resolving the image's type on upload. */
  mimeType: string | null;
  fileName: string | null;
  aspectRatio: number | null;
};

/**
 * Every image path of a message, in order. Messages from older app builds
 * only have image_url; newer builds also set image_urls (first entry ===
 * image_url).
 */
export function getMessageImagePaths(message: {
  image_url?: string | null;
  image_urls?: string[] | null;
}): string[] {
  if (message.image_urls && message.image_urls.length > 0) return message.image_urls;
  return message.image_url ? [message.image_url] : [];
}

/**
 * Minimal shape of a replied-to message embedded in a bubble.
 * Populated via a JOIN when fetching messages (reply_message alias).
 */
export type ReplyPreview = {
  id: string;
  content: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
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
    /** Local picked images, preserved so a failed send can be retried (re-uploaded). */
    images?: PickedChatImage[];
    /** Single-image payload from before multi-image; may still exist on failed messages persisted by an older build. */
    localImageUri?: string | null;
    localImageMimeType?: string | null;
    localImageFileName?: string | null;
    imageAspectRatio?: number | null;
    /** Preserved across retry so replies survive failed-send recovery. */
    replyToId?: string | null;
    /**
     * Idempotency key for this logical send attempt (Phase 3). Reused
     * verbatim by retry() so a retried send can never create a second
     * server-side row — see clientMessageId in useChatSendMessage.ts.
     */
    clientMessageId?: string;
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
