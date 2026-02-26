import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";
import type { ChatMessageVM } from "../types";

type Chat = Database["public"]["Tables"]["chats"]["Row"];

export const MESSAGES_PER_PAGE_DEFAULT = 20;

/**
 * Fetch a single chat by id.
 */
export async function fetchChat(chatId: string): Promise<Chat | null> {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch one page of chat messages (newest first).
 * pageParam 0 = first page, 1 = second page, etc.
 * Also JOINs the replied-to message (reply_to_id FK) so bubbles can render the quote.
 */
export async function fetchChatMessagesPage(
  chatId: string,
  pageParam: number,
  pageSize: number
): Promise<ChatMessageVM[]> {
  const from = pageParam * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from("chat_messages")
    .select(
      // Use the FK column name directly (reply_to_id) without the table prefix.
      // On a self-referencing table, chat_messages!reply_to_id is ambiguous and
      // can resolve in the wrong direction (children instead of parent).
      "*, reply_message:reply_to_id(id, content, image_url, user_id)"
    )
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  // Map the nested `reply_message` alias → `replyToMessage` on the VM
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    // PostgREST can return {} (empty object) instead of null for a null FK
    // join, so check for .id before accepting the nested object.
    replyToMessage: row.reply_message?.id ? row.reply_message : null,
  })) as ChatMessageVM[];
}
