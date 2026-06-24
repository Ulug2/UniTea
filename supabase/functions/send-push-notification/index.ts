import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const MAX_MESSAGE_LENGTH = 80; // Truncate chat message body to 80 characters

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app"];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  };
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

    // ── Direct invoke path ────────────────────────────────────────────────────
    // Called by create-comment with {notificationId, userId, title, body}.
    // Handles a single comment_reply push without going through the batch queue.
    let parsedBody: Record<string, unknown> | null = null;
    if (req.method === "POST") {
      try {
        const text = await req.text();
        if (text.trim()) parsedBody = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsedBody = null;
      }
    }

    const dataField = parsedBody?.data;
    const dataRecord =
      typeof dataField === "object" && dataField !== null && !Array.isArray(dataField)
        ? (dataField as Record<string, unknown>)
        : null;
    const notificationIdRaw = parsedBody?.notificationId ?? dataRecord?.notificationId;
    const notificationId = typeof notificationIdRaw === "string" ? notificationIdRaw : null;
    const userIdDirect = typeof parsedBody?.userId === "string" ? parsedBody.userId : null;
    const titleDirect = typeof parsedBody?.title === "string" ? parsedBody.title : null;
    const bodyDirect = typeof parsedBody?.body === "string" ? parsedBody.body : null;

    if (notificationId && userIdDirect && titleDirect && bodyDirect) {
      const { data: directRow, error: directFetchError } = await supabase
        .from("notifications")
        .select("id, user_id, type, related_post_id, related_user_id")
        .eq("id", notificationId)
        .maybeSingle();

      if (directFetchError) {
        console.error("direct push: fetch notification", directFetchError);
        return new Response(JSON.stringify({ error: "Failed to load notification" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const row = directRow as {
        id: string;
        user_id: string;
        type: string;
        related_post_id: string | null;
        related_user_id: string | null;
      } | null;

      if (!row || row.user_id !== userIdDirect || row.type !== "comment_reply") {
        return new Response(JSON.stringify({ error: "Notification not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: settingsRow } = await supabase
        .from("notification_settings")
        .select("push_token")
        .eq("user_id", userIdDirect)
        .maybeSingle();

      const pushToken = settingsRow?.push_token as string | undefined;
      if (!pushToken) {
        return new Response(
          JSON.stringify({ success: true, direct: true, status: "skipped", reason: "no_push_token" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const notificationIds = [notificationId];
      const { error: directMarkError } = await supabase
        .from("notifications")
        .update({ push_sent: true })
        .in("id", notificationIds)
        .or("push_sent.is.null,push_sent.eq.false");

      if (directMarkError) {
        console.error("direct push: mark sent", directMarkError);
        return new Response(JSON.stringify({ error: "Failed to update notification" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: verifyDirect } = await supabase
        .from("notifications")
        .select("id")
        .in("id", notificationIds)
        .eq("push_sent", true);

      if (!verifyDirect || verifyDirect.length === 0) {
        return new Response(
          JSON.stringify({ success: true, direct: true, status: "skipped", reason: "already_sent" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const pushData: Record<string, unknown> = {
        notificationId: row.id,
        type: "comment_reply",
        relatedPostId: row.related_post_id,
        relatedUserId: row.related_user_id,
      };
      if (dataRecord) {
        for (const [k, v] of Object.entries(dataRecord)) {
          if (!(k in pushData)) pushData[k] = v;
        }
      }

      const directPushResponse = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
        body: JSON.stringify({
          to: pushToken,
          title: titleDirect,
          body: bodyDirect,
          sound: "default",
          badge: 0,
          data: pushData,
        }),
      });

      if (!directPushResponse.ok) {
        const errorText = await directPushResponse.text();
        await supabase.from("notifications").update({ push_sent: false }).in("id", notificationIds);
        return new Response(
          JSON.stringify({ error: `Expo Push API error: ${directPushResponse.status}`, details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const directPushResult = await directPushResponse.json();
      if (directPushResult.data?.status !== "ok") {
        await supabase.from("notifications").update({ push_sent: false }).in("id", notificationIds);
        return new Response(
          JSON.stringify({ success: false, direct: true, error: String(directPushResult.data?.message ?? "Unknown error") }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, direct: true, sent: 1, userId: userIdDirect }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // ── Batch path ────────────────────────────────────────────────────────────
    // Triggered by the DB trigger on every notifications INSERT.

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
    for (const [userId, chatNotifications] of chatNotificationsByUser) {
      try {
        const settings = chatSettingsByUserId.get(userId);
        if (!settings?.push_token || settings.notify_chats !== true) continue;

        const latestChat = chatNotifications[0];
        const senderId = latestChat.related_user_id;
        if (!senderId) continue;

        const notificationIds = chatNotifications.map((n) => n.id);

        const { error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false");

        if (updateError) {
          console.error(`chat: mark sent failed for ${userId}:`, updateError);
          continue;
        }

        const { data: verifyNotifications } = await supabase
          .from("notifications")
          .select("id")
          .in("id", notificationIds)
          .eq("push_sent", true);

        if (!verifyNotifications || verifyNotifications.length === 0) continue;

        let relatedChatId: string | null = latestChat.related_chat_id ?? null;
        let isAnonymousChat = false;

        if (relatedChatId) {
          const { data: chatRow } = await supabase
            .from("chats")
            .select("is_anonymous")
            .eq("id", relatedChatId)
            .single();
          isAnonymousChat = Boolean((chatRow as any)?.is_anonymous);
        } else if (senderId) {
          const chatContext = await resolveChatContextForUsers(userId, senderId);
          relatedChatId = chatContext.chatId;
          isAnonymousChat = chatContext.isAnonymous;
        }

        if (isAnonymousChat && senderId) {
          await supabase
            .from("notifications")
            .update({ related_user_id: null })
            .in("id", notificationIds)
            .eq("type", "chat_message")
            .eq("related_user_id", senderId);
        }

        const senderUsername = senderUsernameById.get(senderId) ?? "Someone";
        const unreadChatCount = unreadChatCountByUserId.get(userId) ?? 0;

        batchQueue.push({
          payload: {
            to: settings.push_token,
            title: isAnonymousChat ? "From: Anonymous user" : senderUsername,
            body: truncateMessage(latestChat.message || "Sent a message"),
            sound: "default",
            badge: unreadChatCount,
            data: {
              notificationId: latestChat.id,
              type: "chat_message",
              relatedUserId: isAnonymousChat ? null : senderId,
              relatedChatId,
              isAnonymousChat,
            },
          },
          notificationIds,
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

        const { error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false");

        if (updateError) {
          console.error(`vote: mark sent failed for ${userId}:`, updateError);
          continue;
        }

        const { data: verifyNotifications } = await supabase
          .from("notifications")
          .select("id")
          .in("id", notificationIds)
          .eq("push_sent", true);

        if (!verifyNotifications || verifyNotifications.length === 0) continue;

        batchQueue.push({
          payload: {
            to: settings.push_token,
            title: "Your post got voted!",
            body: voteNotifications[0].message,
            sound: "default",
            badge: 0,
            data: {
              notificationId: voteNotifications[0].id,
              type: "upvote",
              relatedPostId: voteNotifications[0].related_post_id,
            },
          },
          notificationIds,
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

        const { error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false");

        if (updateError) {
          console.error(`comment: mark sent failed for ${userId}:`, updateError);
          continue;
        }

        const { data: verifyNotifications } = await supabase
          .from("notifications")
          .select("id")
          .in("id", notificationIds)
          .eq("push_sent", true);

        if (!verifyNotifications || verifyNotifications.length === 0) continue;

        batchQueue.push({
          payload: {
            to: settings.push_token,
            title: "New comment",
            body: commentNotifications[0].message,
            sound: "default",
            badge: 0,
            data: {
              notificationId: commentNotifications[0].id,
              type: "comment_reply",
              relatedPostId: commentNotifications[0].related_post_id,
            },
          },
          notificationIds,
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
