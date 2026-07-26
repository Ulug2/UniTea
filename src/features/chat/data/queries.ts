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
 *
 * Reads from chat_messages_view rather than the chat_messages base table:
 * the view nulls out the counterpart's user_id (and their id inside a
 * reply preview) for anonymous chats, and — because anonymous chat_messages
 * rows are unreadable via the base table by design (see Phase 1 migration)
 * — the view is the only path that works for them at all. Non-anonymous
 * chats get identical data either way.
 *
 * reply_message is already a plain jsonb column on the view (views can't
 * carry the real FK PostgREST needs to auto-embed, so it's built inline
 * server-side instead) — same shape as the old embed
 * (`{id, content, image_url, user_id}` or null), so the mapping below is
 * unchanged.
 */
export async function fetchChatMessagesPage(
  chatId: string,
  pageParam: number,
  pageSize: number
): Promise<ChatMessageVM[]> {
  const from = pageParam * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await (supabase as any)
    .from("chat_messages_view")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    replyToMessage: row.reply_message?.id ? row.reply_message : null,
  })) as ChatMessageVM[];
}
