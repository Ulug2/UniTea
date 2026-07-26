import { supabase } from "../../../lib/supabase";
import type { ChatMessageVM } from "../types";
import type { ReplyPreview } from "../types";

type SubscribeCallbacks = {
  /** Raw insert payload is emitted immediately so the UI updates without delay. */
  onRawInsert: (message: ChatMessageVM) => void;
  /**
   * Optional enrichment update for rows that have `reply_to_id`.
   * Used to fill `replyToMessage` without blocking the initial message render.
   */
  onEnrichedInsert?: (message: ChatMessageVM) => void;
};

/**
 * Subscribe to new chat message inserts for a chat.
 *
 * Non-anonymous chats (isAnonymous=false): unchanged postgres_changes path.
 *
 * Anonymous chats: postgres_changes stops delivering these events entirely
 * once the backend redaction is active (Realtime enforces the same RLS as
 * direct reads), so this subscribes to the private Broadcast topic the
 * `broadcast_anonymous_chat_message` trigger publishes to instead
 * (`anon-chat-message:{chatId}:{currentUserId}` — see the Phase 3
 * migration). Because that topic only ever receives messages sent *to*
 * the subscribing user (the trigger never broadcasts to the sender), the
 * payload never needs a user_id field, and there is no self-echo to filter
 * — receipt on this topic always means "from the other person".
 * Blocking is already enforced server-side in the trigger (it skips
 * publishing entirely to a recipient who has blocked the sender, or been
 * blocked by them), so no client-side block check is needed here either.
 *
 * Reply enrichment: same "raw insert now, follow-up SELECT if
 * reply_to_id is set" pattern as the non-anonymous path, pointed at
 * chat_messages_view so the enrichment fetch also respects redaction.
 */
export function subscribeToChatMessages(
  chatId: string,
  currentUserId: string,
  isAnonymous: boolean,
  callbacks: SubscribeCallbacks
): () => void {
  if (isAnonymous) {
    return subscribeToAnonymousChatMessages(chatId, currentUserId, callbacks);
  }
  return subscribeToNonAnonymousChatMessages(chatId, callbacks);
}

function subscribeToNonAnonymousChatMessages(
  chatId: string,
  callbacks: SubscribeCallbacks
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

        // Always emit the raw insert immediately; this removes visible lag when
        // the row requires follow-up enrichment (e.g. reply preview).
        callbacks.onRawInsert(rawMsg as ChatMessageVM);

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
                callbacks.onEnrichedInsert?.(enriched);
              } else {
                // Fallback: pass the raw row without reply context
                callbacks.onEnrichedInsert?.(rawMsg as ChatMessageVM);
              }
            });
        }
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
}

function subscribeToAnonymousChatMessages(
  chatId: string,
  currentUserId: string,
  callbacks: SubscribeCallbacks
): () => void {
  const topic = `anon-chat-message:${chatId}:${currentUserId}`;
  const channel = supabase
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "new_message" }, (payload) => {
      const rawMsg = payload.payload as any;
      if (!rawMsg?.id || rawMsg.chat_id !== chatId) return;

      callbacks.onRawInsert(rawMsg as ChatMessageVM);

      if (rawMsg.reply_to_id) {
        (supabase as any)
          .from("chat_messages_view")
          .select("*")
          .eq("id", rawMsg.id)
          .single()
          .then(({ data }: { data: any }) => {
            if (data) {
              const enriched: ChatMessageVM = {
                ...data,
                replyToMessage: data.reply_message?.id
                  ? (data.reply_message as ReplyPreview)
                  : null,
              };
              callbacks.onEnrichedInsert?.(enriched);
            } else {
              callbacks.onEnrichedInsert?.(rawMsg as ChatMessageVM);
            }
          });
      }
    })
    .subscribe();

  return () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
}
