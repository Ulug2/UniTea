import { supabase } from "../../../lib/supabase";
import type { ChatMessageVM } from "../types";

/**
 * Subscribe to new chat message inserts for a chat.
 * Calls onInsert for each new message (payload.new as ChatMessageVM).
 * Returns an unsubscribe function (unsubscribe + removeChannel).
 */
export function subscribeToChatMessages(
  chatId: string,
  onInsert: (message: ChatMessageVM) => void
): () => void {
  const channelName = `chat-${chatId}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const newMessage = payload.new as ChatMessageVM;
        onInsert(newMessage);
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
}
