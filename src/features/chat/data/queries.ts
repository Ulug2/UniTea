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
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return (data ?? []) as ChatMessageVM[];
}
