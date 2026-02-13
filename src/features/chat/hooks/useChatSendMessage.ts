import { useState, useCallback, useRef } from "react";
import { Alert } from "react-native";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";
import { uploadImage } from "../../../utils/supabaseImages";
import { logger } from "../../../utils/logger";
import type { ChatMessageVM, MessagesQueryData } from "../types";
import {
  addOptimisticMessage,
  replaceOptimisticMessage,
  markMessageFailed,
  removeOptimisticMessage,
} from "../data/cache";

const RATE_LIMIT_MESSAGES = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const PENDING_CLEANUP_MS = 5000;

type SendParams = { text: string; localImageUri?: string | null };

type Options = {
  pendingMessageIdsRef: React.MutableRefObject<Set<string>>;
  optimisticImageUrisRef: React.MutableRefObject<Map<string, string>>;
  flatListRef?: React.RefObject<{ scrollToOffset: (p: { offset: number; animated: boolean }) => void } | null>;
  onRestoreInput?: (messageText: string, localImageUri: string | null) => void;
};

type MutationContext = {
  previousMessages: MessagesQueryData | undefined;
  previousSummaries: unknown[] | undefined;
  tempId: string;
  optimisticMessage: ChatMessageVM;
};

function checkServerRateLimit(
  queryClient: QueryClient,
  currentUserId: string,
  chatId: string
): Promise<void> {
  // RPC may not exist in schema; type assertion at call site per plan
  const supabaseWithRpc = supabase as unknown as {
    rpc: (
      name: string,
      params: { p_user_id: string; p_chat_id: string; p_max_messages: number; p_time_window_minutes: number }
    ) => Promise<{ data: boolean | null; error: unknown }>;
  };
  return supabaseWithRpc
    .rpc("check_message_rate_limit", {
      p_user_id: currentUserId,
      p_chat_id: chatId,
      p_max_messages: 10,
      p_time_window_minutes: 1,
    })
    .then(({ data, error }) => {
      if (!error && data === false) {
        throw new Error("RATE_LIMIT_EXCEEDED: You're sending messages too quickly. Please wait a moment.");
      }
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("RATE_LIMIT_EXCEEDED")) throw err;
      // RPC not deployed or other error – continue
    });
}

export function useChatSendMessage(
  chatId: string,
  currentUserId: string | undefined,
  options: Options
) {
  const queryClient = useQueryClient();
  const { pendingMessageIdsRef, optimisticImageUrisRef, flatListRef, onRestoreInput } = options;

  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const messageSendTimes = useRef<number[]>([]);

  const mutation = useMutation<
    { newMessage: ChatMessageVM; now: string },
    Error,
    { messageText: string; imageUrl?: string | null; localImageUri?: string | null },
    MutationContext | undefined
  >({
    mutationFn: async ({ messageText, imageUrl }) => {
      if (!chatId || !currentUserId) {
        throw new Error("Missing chat ID or user ID");
      }

      try {
        await checkServerRateLimit(queryClient, currentUserId, chatId);
      } catch (rpcErr) {
        if (rpcErr instanceof Error && rpcErr.message.includes("RATE_LIMIT_EXCEEDED")) {
          throw rpcErr;
        }
      }

      const now = new Date().toISOString();
      const insertPayload: Database["public"]["Tables"]["chat_messages"]["Insert"] = {
        chat_id: chatId,
        user_id: currentUserId,
        content: messageText || "",
        is_read: false,
      };
      if (imageUrl != null && imageUrl !== "") {
        insertPayload.image_url = imageUrl;
      }

      const { data: newMessage, error: messageError } = await supabase
        .from("chat_messages")
        .insert(insertPayload)
        .select()
        .single();

      if (messageError) {
        if (
          messageError.message?.includes("rate limit") ||
          messageError.message?.includes("too many")
        ) {
          throw new Error("RATE_LIMIT_EXCEEDED: You're sending messages too quickly. Please wait a moment.");
        }
        throw messageError;
      }

      supabase
        .from("chats")
        .update({ last_message_at: now })
        .eq("id", chatId)
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: ["chat-summaries", currentUserId],
            refetchType: "none",
          });
        });

      return { newMessage: newMessage as ChatMessageVM, now };
    },
    onMutate: async ({ messageText, imageUrl, localImageUri }) => {
      if (!chatId || !currentUserId) throw new Error("Missing chat ID or user ID");

      queryClient.cancelQueries({ queryKey: ["chat-messages", chatId] });
      queryClient.cancelQueries({ queryKey: ["chat-summaries", currentUserId] });

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const now = new Date().toISOString();

      if (localImageUri && imageUrl) {
        optimisticImageUrisRef.current.set(tempId, localImageUri);
      }

      const optimisticMessage: ChatMessageVM = {
        id: tempId,
        chat_id: chatId,
        user_id: currentUserId,
        content: messageText || "",
        image_url: imageUrl || null,
        created_at: now,
        is_read: false,
        deleted_by_receiver: null,
        deleted_by_sender: null,
        sendStatus: "sending",
        _clientPayload: {
          messageText,
          imageUrl: imageUrl ?? null,
          localImageUri: localImageUri ?? null,
        },
      };

      pendingMessageIdsRef.current.add(tempId);

      const previousMessages = queryClient.getQueryData<MessagesQueryData>([
        "chat-messages",
        chatId,
      ]);
      const previousSummaries = queryClient.getQueryData<unknown[]>([
        "chat-summaries",
        currentUserId,
      ]);

      addOptimisticMessage(queryClient, chatId, optimisticMessage);

      queryClient.setQueryData<unknown[]>(["chat-summaries", currentUserId], (oldSummaries: unknown[] | undefined) => {
        if (!oldSummaries || !Array.isArray(oldSummaries)) return oldSummaries ?? [];
        let updatedChat: unknown = null;
        const others = oldSummaries.filter((summary: unknown) => {
          const s = summary as { chat_id?: string };
          if (s.chat_id === chatId) {
            updatedChat = {
              ...s,
              last_message_content: messageText,
              last_message_at: now,
              last_message_has_image: !!(imageUrl && String(imageUrl).trim() !== ""),
            };
            return false;
          }
          return true;
        });
        return updatedChat ? [updatedChat, ...others] : oldSummaries;
      });

      queryClient.setQueryData<number>(["global-unread-count", currentUserId], (c) => c);

      setTimeout(() => {
        flatListRef?.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);

      return {
        previousMessages,
        previousSummaries: previousSummaries as unknown[] | undefined,
        tempId,
        optimisticMessage,
      };
    },
    onSuccess: (data, _variables, context) => {
      if (!context || !chatId) return;
      const { newMessage } = data;
      const { tempId } = context;

      pendingMessageIdsRef.current.delete(tempId);
      optimisticImageUrisRef.current.delete(tempId);
      pendingMessageIdsRef.current.add(newMessage.id);
      setTimeout(() => {
        pendingMessageIdsRef.current.delete(newMessage.id);
      }, PENDING_CLEANUP_MS);

      replaceOptimisticMessage(queryClient, chatId, tempId, {
        ...newMessage,
        sendStatus: undefined,
        _clientPayload: undefined,
      });
    },
    onError: (error, variables, context) => {
      if (messageSendTimes.current.length > 0) messageSendTimes.current.pop();

      logger.error("Error sending message", error, {
        userId: currentUserId,
        chatId,
        operation: "sendMessage",
        hasImage: !!variables?.imageUrl,
      });

      if (!context) return;

      if (context.tempId) {
        pendingMessageIdsRef.current.delete(context.tempId);
        optimisticImageUrisRef.current.delete(context.tempId);
      }

      const isNetworkError =
        (error?.message && (String(error.message).includes("network") || String(error.message).includes("timeout") || String(error.message).includes("fetch"))) ||
        (error as { code?: string })?.code === "ECONNABORTED" ||
        (error as { code?: string })?.code === "ETIMEDOUT";

      if (isNetworkError && context.tempId) {
        markMessageFailed(queryClient, chatId, context.tempId);
        Alert.alert(
          "Connection issue",
          "We couldn't confirm if your message was delivered. It is marked as failed — tap it to retry.",
          [{ text: "OK" }]
        );
        return;
      }

      if (context.previousMessages) {
        queryClient.setQueryData(["chat-messages", chatId], context.previousMessages);
      }
      if (context.previousSummaries) {
        queryClient.setQueryData(["chat-summaries", currentUserId], context.previousSummaries);
      }

      const isRateLimit =
        String(error?.message ?? "").includes("RATE_LIMIT_EXCEEDED") ||
        String(error?.message ?? "").includes("too quickly");
      if (isRateLimit) {
        Alert.alert(
          "Rate Limit",
          "You're sending messages too quickly. Please wait a moment before sending another message.",
          [{ text: "OK" }]
        );
        return;
      }

      const msg = String(error?.message ?? "");
      const isPgrst204 =
        (error as { code?: string })?.code === "PGRST204" || msg.includes("Could not find");
      if (variables && onRestoreInput) {
        onRestoreInput(variables.messageText ?? "", variables.localImageUri ?? null);
      }
      Alert.alert(
        "Error",
        isPgrst204
          ? "Chat images require a database update. Run sql/add_chat_message_image.sql in Supabase SQL Editor, then reload schema."
          : "Failed to send message. Please try again."
      );
    },
  });

  const send = useCallback(
    async (params: SendParams) => {
      if (isSendingRef.current || isSending) return;
      if (!chatId || !currentUserId) return;
      const { text: messageText, localImageUri } = params;
      if (!messageText?.trim() && !localImageUri) return;

      isSendingRef.current = true;
      setIsSending(true);

      const now = Date.now();
      messageSendTimes.current = messageSendTimes.current.filter(
        (t) => now - t < RATE_LIMIT_WINDOW_MS
      );
      if (messageSendTimes.current.length >= RATE_LIMIT_MESSAGES) {
        const waitSec = Math.ceil(
          (RATE_LIMIT_WINDOW_MS - (now - messageSendTimes.current[0])) / 1000
        );
        Alert.alert(
          "Rate Limit",
          `You're sending messages too quickly. Please wait ${waitSec} second${waitSec !== 1 ? "s" : ""} before sending another message.`,
          [{ text: "OK" }]
        );
        isSendingRef.current = false;
        setIsSending(false);
        return;
      }
      messageSendTimes.current.push(now);

      let imageUrl: string | null = null;
      if (localImageUri) {
        try {
          imageUrl = await uploadImage(localImageUri, supabase, "chat-images");
        } catch (err) {
          logger.error("Error uploading chat image", err as Error);
          Alert.alert("Error", "Failed to upload image. Please try again.");
          isSendingRef.current = false;
          setIsSending(false);
          return;
        }
      }

      mutation.mutate(
        { messageText: messageText?.trim() ?? "", imageUrl, localImageUri },
        {
          onSettled: () => {
            isSendingRef.current = false;
            setIsSending(false);
          },
        }
      );
    },
    [chatId, currentUserId, isSending, mutation]
  );

  const retry = useCallback(
    (messageIdOrTempId: string) => {
      if (!chatId || !currentUserId) return;
      const data = queryClient.getQueryData<MessagesQueryData>(["chat-messages", chatId]);
      const all = data?.pages?.flat() ?? [];
      const msg = all.find((m) => m.id === messageIdOrTempId);
      if (!msg?.sendStatus || msg.sendStatus !== "failed") return;
      const payload = msg._clientPayload;
      const localUri =
        payload?.localImageUri ?? optimisticImageUrisRef.current.get(messageIdOrTempId);
      removeOptimisticMessage(queryClient, chatId, messageIdOrTempId);
      send({
        text: payload?.messageText ?? msg.content ?? "",
        localImageUri: localUri ?? null,
      });
    },
    [chatId, currentUserId, queryClient, send, optimisticImageUrisRef]
  );

  return { send, retry, isSending };
}
