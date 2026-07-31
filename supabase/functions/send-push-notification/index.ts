import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const MAX_MESSAGE_LENGTH = 80; // Truncate chat message body to 80 characters

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app"];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

interface NotificationRecord {
  id: string;
  user_id: string;
  type: "chat_message" | "upvote" | "comment_reply";
  message: string;
  is_read: boolean;
  created_at: string;
  related_user_id?: string | null;
  related_post_id?: string | null;
  related_chat_id?: string | null;
}

// One entry per user per type; all are sent in a single Expo batch call.
interface BatchEntry {
  payload: Record<string, unknown>;
  notificationIds: string[];
  userId: string;
}

serve(async (req) => {
  const corsHeaders = {
    ...getCorsHeaders(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify the webhook secret. JWT verification is disabled for this function
  // (verify_jwt = false in config.toml) so callers authenticate with a shared
  // secret instead of a service-role Bearer token.
  const expectedSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("NOTIFICATION_WEBHOOK_SECRET is not set");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  const incomingSecret = req.headers.get("x-webhook-secret");
  if (!incomingSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Batch path ────────────────────────────────────────────────────────────
    // Triggered by the DB trigger on every notifications INSERT. This is the
    // only path in this function — a previously-present "direct invoke"
    // branch (expecting a POST body of {notificationId, userId, title, body})
    // was removed: nothing in the codebase (no edge function, trigger, or
    // client) ever called it that way, confirmed by searching for
    // `notificationId` and this function's URL across supabase/ and src/.
    // comment_reply notifications (create-comment's plain `notifications`
    // insert) have only ever reached devices through this batch path below.

    const { data: notifications, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .eq("is_read", false)
      .or("push_sent.eq.false,push_sent.is.null")
      .order("created_at", { ascending: false })
      .limit(100);

    if (fetchError) throw fetchError;

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: "No notifications to send" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group by type → user
    const chatNotificationsByUser = new Map<string, NotificationRecord[]>();
    const voteNotificationsByUser = new Map<string, NotificationRecord[]>();
    const commentNotificationsByUser = new Map<string, NotificationRecord[]>();

    for (const notification of notifications) {
      const uid = notification.user_id;
      if (notification.type === "chat_message") {
        if (!chatNotificationsByUser.has(uid)) chatNotificationsByUser.set(uid, []);
        chatNotificationsByUser.get(uid)!.push(notification);
      } else if (notification.type === "upvote") {
        if (!voteNotificationsByUser.has(uid)) voteNotificationsByUser.set(uid, []);
        voteNotificationsByUser.get(uid)!.push(notification);
      } else if (notification.type === "comment_reply") {
        if (!commentNotificationsByUser.has(uid)) commentNotificationsByUser.set(uid, []);
        commentNotificationsByUser.get(uid)!.push(notification);
      }
    }

    const results: { userId: string; notificationCount: number; status: string }[] = [];
    const errors: { userId: string; error: string }[] = [];

    const truncateMessage = (message: string): string =>
      message.length <= MAX_MESSAGE_LENGTH ? message : message.substring(0, MAX_MESSAGE_LENGTH) + "...";

    const resolveChatContextForUsers = async (
      recipientUserId: string,
      senderUserId: string,
    ): Promise<{ chatId: string | null; isAnonymous: boolean }> => {
      const { data: rows } = await supabase
        .from("chats")
        .select("id, is_anonymous")
        .or(
          `and(participant_1_id.eq.${recipientUserId},participant_2_id.eq.${senderUserId}),` +
          `and(participant_1_id.eq.${senderUserId},participant_2_id.eq.${recipientUserId})`,
        )
        .order("created_at", { ascending: false })
        .limit(1);

      const row = rows?.[0] as { id: string; is_anonymous: boolean } | undefined;
      return { chatId: row?.id ?? null, isAnonymous: Boolean(row?.is_anonymous) };
    };

    // ── Batch DB lookups (settings, sender names, unread counts) ─────────────
    // All three notification types fetch settings upfront so the processing
    // loops below make zero per-user DB calls.

    const chatRecipientIds = Array.from(chatNotificationsByUser.keys());
    const voteRecipientIds = Array.from(voteNotificationsByUser.keys());
    const commentRecipientIds = Array.from(commentNotificationsByUser.keys());

    const chatSettingsByUserId = new Map<string, { push_token: string; notify_chats: boolean }>();
    if (chatRecipientIds.length > 0) {
      const { data: rows } = await supabase
        .from("notification_settings")
        .select("user_id, push_token, notify_chats")
        .in("user_id", chatRecipientIds);
      for (const row of (rows ?? []) as any[]) {
        if (row?.user_id) chatSettingsByUserId.set(row.user_id, { push_token: row.push_token, notify_chats: row.notify_chats });
      }
    }

    const voteSettingsByUserId = new Map<string, { push_token: string; notify_upvotes: boolean }>();
    if (voteRecipientIds.length > 0) {
      const { data: rows } = await supabase
        .from("notification_settings")
        .select("user_id, push_token, notify_upvotes")
        .in("user_id", voteRecipientIds);
      for (const row of (rows ?? []) as any[]) {
        if (row?.user_id) voteSettingsByUserId.set(row.user_id, { push_token: row.push_token, notify_upvotes: row.notify_upvotes });
      }
    }

    const commentSettingsByUserId = new Map<string, { push_token: string }>();
    if (commentRecipientIds.length > 0) {
      const { data: rows } = await supabase
        .from("notification_settings")
        .select("user_id, push_token")
        .in("user_id", commentRecipientIds);
      for (const row of (rows ?? []) as any[]) {
        if (row?.user_id) commentSettingsByUserId.set(row.user_id, { push_token: row.push_token });
      }
    }

    // Sender usernames for chat title
    const chatSenderIds = Array.from(
      new Set(
        chatRecipientIds
          .map((id) => chatNotificationsByUser.get(id)?.[0]?.related_user_id)
          .filter(Boolean),
      ),
    ) as string[];

    const senderUsernameById = new Map<string, string>();
    if (chatSenderIds.length > 0) {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", chatSenderIds);
      for (const row of (rows ?? []) as any[]) {
        if (row?.id) senderUsernameById.set(row.id, row.username || "Someone");
      }
    }

    // Unread badge counts for chat recipients
    const unreadChatCountByUserId = new Map<string, number>();
    for (const uid of chatRecipientIds) unreadChatCountByUserId.set(uid, 0);

    if (chatRecipientIds.length > 0) {
      const { data: p1Rows } = await supabase
        .from("user_chats_summary")
        .select("participant_1_id, unread_count_p1")
        .in("participant_1_id", chatRecipientIds);
      for (const row of (p1Rows ?? []) as any[]) {
        const uid = row.participant_1_id as string;
        unreadChatCountByUserId.set(uid, (unreadChatCountByUserId.get(uid) ?? 0) + (row.unread_count_p1 || 0));
      }

      const { data: p2Rows } = await supabase
        .from("user_chats_summary")
        .select("participant_2_id, unread_count_p2")
        .in("participant_2_id", chatRecipientIds);
      for (const row of (p2Rows ?? []) as any[]) {
        const uid = row.participant_2_id as string;
        unreadChatCountByUserId.set(uid, (unreadChatCountByUserId.get(uid) ?? 0) + (row.unread_count_p2 || 0));
      }
    }

    // ── Collect push payloads ─────────────────────────────────────────────────
    // Each loop marks its notifications as sent (race-condition guard), then
    // pushes to batchQueue. The actual Expo API call happens once after all
    // loops, with all payloads in a single request.

    const batchQueue: BatchEntry[] = [];

    // Chat notifications
    // Note: related_user_id is NULL for anonymous chats — the notify_chat_message
    // DB trigger sets it to NULL at INSERT time so the recipient never sees the
    // sender's real identity in their notifications table, even briefly.
    // We use related_chat_id for context resolution when related_user_id is null.
    for (const [userId, chatNotifications] of chatNotificationsByUser) {
      try {
        const settings = chatSettingsByUserId.get(userId);
        if (!settings?.push_token || settings.notify_chats !== true) continue;

        const latestChat = chatNotifications[0];
        const senderId = latestChat.related_user_id as string | null;
        const relatedChatId: string | null = latestChat.related_chat_id ?? null;

        // For anonymous chats, related_user_id is null; we still have related_chat_id.
        // For non-anonymous chats, both should be present.
        if (!senderId && !relatedChatId) continue;

        const notificationIds = chatNotifications.map((n) => n.id);

        // Atomically claim only the notifications this invocation actually
        // wins the race for. `.select("id")` chained onto `.update()` returns
        // exactly the rows THIS call's UPDATE affected (filtered by the
        // push_sent-is-null-or-false guard below) — so a concurrent
        // invocation that loses the race for a given id simply won't see it
        // come back here, instead of independently re-discovering
        // "push_sent = true" via a separate SELECT (which can't tell "I just
        // set this" apart from "another invocation already did") and sending
        // a duplicate push for it.
        const { data: claimedRows, error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false")
          .select("id");

        if (updateError) {
          console.error(`chat: mark sent failed for ${userId}:`, updateError);
          continue;
        }

        const claimedIds = new Set((claimedRows ?? []).map((row) => row.id as string));
        const claimedChatNotifications = chatNotifications.filter((n) =>
          claimedIds.has(n.id),
        );
        if (claimedChatNotifications.length === 0) continue;

        const notificationToSend = claimedChatNotifications[0];
        const sendSenderId = notificationToSend.related_user_id as string | null;
        const sendRelatedChatId: string | null = notificationToSend.related_chat_id ?? null;

        // Determine if chat is anonymous.
        // sendSenderId is null ↔ trigger already marked the chat as anonymous.
        const isAnonymousChat = !sendSenderId;

        const senderUsername = sendSenderId
          ? (senderUsernameById.get(sendSenderId) ?? "Someone")
          : "Anonymous user";
        const unreadChatCount = unreadChatCountByUserId.get(userId) ?? 0;

        batchQueue.push({
          payload: {
            to: settings.push_token,
            title: isAnonymousChat ? "From: Anonymous user" : senderUsername,
            body: truncateMessage(notificationToSend.message || "Sent a message"),
            sound: "default",
            badge: unreadChatCount,
            data: {
              notificationId: notificationToSend.id,
              type: "chat_message",
              relatedUserId: isAnonymousChat ? null : sendSenderId,
              relatedChatId: sendRelatedChatId,
              isAnonymousChat,
            },
          },
          notificationIds: claimedChatNotifications.map((n) => n.id),
          userId,
        });
      } catch (error: any) {
        errors.push({ userId, error: error?.message || "Failed to process chat notification" });
      }
    }

    // Vote (upvote milestone) notifications
    for (const [userId, voteNotifications] of voteNotificationsByUser) {
      try {
        const settings = voteSettingsByUserId.get(userId);
        if (!settings?.push_token || settings.notify_upvotes !== true) continue;

        const notificationIds = voteNotifications.map((n) => n.id);

        // Atomically claim only the notifications this invocation actually
        // wins the race for (see the chat loop above for the full rationale).
        const { data: claimedRows, error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false")
          .select("id");

        if (updateError) {
          console.error(`vote: mark sent failed for ${userId}:`, updateError);
          continue;
        }

        const claimedIds = new Set((claimedRows ?? []).map((row) => row.id as string));
        const claimedVoteNotifications = voteNotifications.filter((n) =>
          claimedIds.has(n.id),
        );
        if (claimedVoteNotifications.length === 0) continue;

        const notificationToSend = claimedVoteNotifications[0];

        batchQueue.push({
          payload: {
            to: settings.push_token,
            title: "Your post got voted!",
            body: notificationToSend.message,
            sound: "default",
            badge: 0,
            data: {
              notificationId: notificationToSend.id,
              type: "upvote",
              relatedPostId: notificationToSend.related_post_id,
            },
          },
          notificationIds: claimedVoteNotifications.map((n) => n.id),
          userId,
        });
      } catch (error: any) {
        errors.push({ userId, error: error?.message || "Failed to process vote notification" });
      }
    }

    // Comment reply notifications
    for (const [userId, commentNotifications] of commentNotificationsByUser) {
      try {
        const settings = commentSettingsByUserId.get(userId);
        if (!settings?.push_token) continue;

        const notificationIds = commentNotifications.map((n) => n.id);

        // Atomically claim only the notifications this invocation actually
        // wins the race for (see the chat loop above for the full rationale).
        const { data: claimedRows, error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false")
          .select("id");

        if (updateError) {
          console.error(`comment: mark sent failed for ${userId}:`, updateError);
          continue;
        }

        const claimedIds = new Set((claimedRows ?? []).map((row) => row.id as string));
        const claimedCommentNotifications = commentNotifications.filter((n) =>
          claimedIds.has(n.id),
        );
        if (claimedCommentNotifications.length === 0) continue;

        const notificationToSend = claimedCommentNotifications[0];

        batchQueue.push({
          payload: {
            to: settings.push_token,
            title: "New comment",
            body: notificationToSend.message,
            sound: "default",
            badge: 0,
            data: {
              notificationId: notificationToSend.id,
              type: "comment_reply",
              relatedPostId: notificationToSend.related_post_id,
            },
          },
          notificationIds: claimedCommentNotifications.map((n) => n.id),
          userId,
        });
      } catch (error: any) {
        errors.push({ userId, error: error?.message || "Failed to process comment notification" });
      }
    }

    // ── Single Expo batch send ────────────────────────────────────────────────
    if (batchQueue.length > 0) {
      const pushResponse = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batchQueue.map((e) => e.payload)),
      });

      if (!pushResponse.ok) {
        const errorText = await pushResponse.text();
        // Roll back all so they'll be retried on the next trigger invocation
        const allIds = batchQueue.flatMap((e) => e.notificationIds);
        await supabase.from("notifications").update({ push_sent: false }).in("id", allIds);
        throw new Error(`Expo Push API error: ${pushResponse.status} - ${errorText}`);
      }

      const pushResult = await pushResponse.json();
      // Expo returns an array of tickets when the request body is an array.
      const tickets = Array.isArray(pushResult.data) ? pushResult.data : [pushResult.data];

      for (let i = 0; i < batchQueue.length; i++) {
        const { notificationIds, userId } = batchQueue[i];
        const ticket = tickets[i] as { status: string; message?: string } | undefined;
        if (ticket?.status === "ok") {
          results.push({ userId, notificationCount: notificationIds.length, status: "sent" });
        } else {
          await supabase.from("notifications").update({ push_sent: false }).in("id", notificationIds);
          errors.push({ userId, error: String(ticket?.message ?? "Unknown error") });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.length,
        errorCount: errors.length,
        results,
        errorDetails: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      },
    );
  } catch (error: any) {
    console.error("Error in send-push-notification:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }
});
