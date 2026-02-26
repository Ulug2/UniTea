import { supabase } from "../../../lib/supabase";
import type { ChatMessageVM } from "../types";
import type { ReplyPreview } from "../types";

/**
 * Subscribe to new chat message inserts for a chat.
 * Calls onInsert for each new message, enriched with the joined reply_message
 * data when the incoming row has reply_to_id set (Postgres change payloads
 * only contain flat row data — no JOINs — so we do a follow-up SELECT).
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
        const rawMsg = payload.new as any;

        if (rawMsg.reply_to_id) {
          // The postgres_changes payload has no JOIN data. Do a follow-up
          // SELECT with the reply alias so the bubble renders the quote block.
          supabase
            .from("chat_messages")
            .select(
              "*, reply_message:reply_to_id(id, content, image_url, user_id)"
            )
            .eq("id", rawMsg.id)
            .single()
            .then(({ data }) => {
              if (data) {
                const enriched: ChatMessageVM = {
                  ...(data as any),
                  replyToMessage: (data as any).reply_message?.id
                    ? ((data as any).reply_message as ReplyPreview)
                    : null,
                };
                onInsert(enriched);
              } else {
                // Fallback: pass the raw row without reply context
                onInsert(rawMsg as ChatMessageVM);
              }
            });
        } else {
          onInsert(rawMsg as ChatMessageVM);
        }
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
}
