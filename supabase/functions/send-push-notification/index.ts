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
      "authorization, x-client-info, apikey, content-type",
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
}

serve(async (req) => {
  const corsHeaders = {
    ...getCorsHeaders(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Direct invoke (e.g. from create-comment): JSON body with userId, title, body, data.notificationId
    let parsedBody: Record<string, unknown> | null = null;
    if (req.method === "POST") {
      try {
        const text = await req.text();
        if (text.trim()) {
          parsedBody = JSON.parse(text) as Record<string, unknown>;
        }
      } catch {
        parsedBody = null;
      }
    }

    const dataField = parsedBody?.data;
    const dataRecord =
      typeof dataField === "object" && dataField !== null && !Array.isArray(dataField)
        ? (dataField as Record<string, unknown>)
        : null;
    const notificationIdRaw =
      parsedBody?.notificationId ?? dataRecord?.notificationId;
    const notificationId =
      typeof notificationIdRaw === "string" ? notificationIdRaw : null;
    const userIdDirect =
      typeof parsedBody?.userId === "string" ? parsedBody.userId : null;
    const titleDirect =
      typeof parsedBody?.title === "string" ? parsedBody.title : null;
    const bodyDirect =
      typeof parsedBody?.body === "string" ? parsedBody.body : null;

    if (notificationId && userIdDirect && titleDirect && bodyDirect) {
      const { data: directRow, error: directFetchError } = await supabase
        .from("notifications")
        .select("id, user_id, type, related_post_id")
        .eq("id", notificationId)
        .maybeSingle();

      if (directFetchError) {
        console.error("direct push: fetch notification", directFetchError);
        return new Response(
          JSON.stringify({ error: "Failed to load notification" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const row = directRow as {
        id: string;
        user_id: string;
        type: string;
        related_post_id: string | null;
      } | null;

      if (
        !row ||
        row.user_id !== userIdDirect ||
        row.type !== "comment_reply"
      ) {
        return new Response(
          JSON.stringify({ error: "Notification not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const { data: settingsRow } = await supabase
        .from("notification_settings")
        .select("push_token")
        .eq("user_id", userIdDirect)
        .maybeSingle();

      const pushToken = settingsRow?.push_token as string | undefined;
      if (!pushToken) {
        return new Response(
          JSON.stringify({
            success: true,
            direct: true,
            status: "skipped",
            reason: "no_push_token",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
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
        return new Response(
          JSON.stringify({ error: "Failed to update notification" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const { data: verifyDirect } = await supabase
        .from("notifications")
        .select("id")
        .in("id", notificationIds)
        .eq("push_sent", true);

      if (!verifyDirect || verifyDirect.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            direct: true,
            status: "skipped",
            reason: "already_sent",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const pushData: Record<string, unknown> = {
        notificationId: row.id,
        type: "comment_reply",
        relatedPostId: row.related_post_id,
      };
      if (dataRecord) {
        for (const [k, v] of Object.entries(dataRecord)) {
          if (!(k in pushData)) pushData[k] = v;
        }
      }

      const pushPayload = {
        to: pushToken,
        title: titleDirect,
        body: bodyDirect,
        sound: "default",
        badge: 0,
        data: pushData,
      };

      const pushResponse = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(pushPayload),
      });

      if (!pushResponse.ok) {
        const errorText = await pushResponse.text();
        await supabase
          .from("notifications")
          .update({ push_sent: false })
          .in("id", notificationIds);
        return new Response(
          JSON.stringify({
            error: `Expo Push API error: ${pushResponse.status}`,
            details: errorText,
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const pushResult = await pushResponse.json();
      if (pushResult.data?.status !== "ok") {
        await supabase
          .from("notifications")
          .update({ push_sent: false })
          .in("id", notificationIds);
        return new Response(
          JSON.stringify({
            success: false,
            direct: true,
            error: String(pushResult.data?.message ?? "Unknown error"),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          direct: true,
          sent: 1,
          userId: userIdDirect,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Get unread notifications that haven't been sent yet (deduplication)
    // We'll use a webhook approach: fetch recent notifications and send push notifications
    const { data: notifications, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .eq("is_read", false)
      .or("push_sent.eq.false,push_sent.is.null") // Fetch unsent notifications (false or NULL)
      .order("created_at", { ascending: false })
      .limit(100); // Process up to 100 notifications at a time

    if (fetchError) {
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ message: "No notifications to send" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Separate notifications by type: chat vs votes vs comments
    const chatNotificationsByUser = new Map<string, NotificationRecord[]>();
    const voteNotificationsByUser = new Map<string, NotificationRecord[]>();
    const commentNotificationsByUser = new Map<string, NotificationRecord[]>();

    for (const notification of notifications) {
      const userId = notification.user_id;
      if (notification.type === "chat_message") {
        if (!chatNotificationsByUser.has(userId)) {
          chatNotificationsByUser.set(userId, []);
        }
        chatNotificationsByUser.get(userId)!.push(notification);
      } else if (notification.type === "upvote") {
        if (!voteNotificationsByUser.has(userId)) {
          voteNotificationsByUser.set(userId, []);
        }
        voteNotificationsByUser.get(userId)!.push(notification);
      } else if (notification.type === "comment_reply") {
        const commentUserId = notification.user_id;
        if (!commentNotificationsByUser.has(commentUserId)) {
          commentNotificationsByUser.set(commentUserId, []);
        }
        commentNotificationsByUser.get(commentUserId)!.push(notification);
      }
    }

    const results: { userId: string; notificationCount: number; status: string }[] = [];
    const errors: { userId: string; error: string }[] = [];

    // Helper: Truncate message to MAX_MESSAGE_LENGTH
    const truncateMessage = (message: string): string => {
      if (message.length <= MAX_MESSAGE_LENGTH) return message;
      return message.substring(0, MAX_MESSAGE_LENGTH) + "...";
    };

    // Batch lookup for notification settings, sender usernames, and badge counts.
    // This replaces sequential per-user DB calls inside the send loops.
    const chatRecipientIds = Array.from(chatNotificationsByUser.keys());
    const voteRecipientIds = Array.from(voteNotificationsByUser.keys());

    const chatSettingsByUserId = new Map<
      string,
      { push_token: string; notify_chats: boolean }
    >();
    if (chatRecipientIds.length > 0) {
      const { data: chatSettingsRows, error: chatSettingsError } = await supabase
        .from("notification_settings")
        .select("user_id, push_token, notify_chats")
        .in("user_id", chatRecipientIds);

      if (!chatSettingsError && chatSettingsRows) {
        for (const row of chatSettingsRows as any[]) {
          if (row?.user_id) {
            chatSettingsByUserId.set(row.user_id, {
              push_token: row.push_token,
              notify_chats: row.notify_chats,
            });
          }
        }
      }
    }

    const voteSettingsByUserId = new Map<
      string,
      { push_token: string; notify_upvotes: boolean }
    >();
    if (voteRecipientIds.length > 0) {
      const { data: voteSettingsRows, error: voteSettingsError } = await supabase
        .from("notification_settings")
        .select("user_id, push_token, notify_upvotes")
        .in("user_id", voteRecipientIds);

      if (!voteSettingsError && voteSettingsRows) {
        for (const row of voteSettingsRows as any[]) {
          if (row?.user_id) {
            voteSettingsByUserId.set(row.user_id, {
              push_token: row.push_token,
              notify_upvotes: row.notify_upvotes,
            });
          }
        }
      }
    }

    // For each recipient user, we use chatNotifications[0].related_user_id for title.
    const chatSenderIds = Array.from(
      new Set(
        chatRecipientIds
          .map((recipientId) => chatNotificationsByUser.get(recipientId)?.[0]?.related_user_id)
          .filter(Boolean),
      ),
    ) as string[];

    const senderUsernameById = new Map<string, string>();
    if (chatSenderIds.length > 0) {
      const { data: senderProfiles, error: senderProfilesError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", chatSenderIds);

      if (!senderProfilesError && senderProfiles) {
        for (const row of senderProfiles as any[]) {
          if (row?.id) senderUsernameById.set(row.id, row.username || "Someone");
        }
      }
    }

    // Precompute unread badge counts for all chat recipients.
    const unreadChatCountByUserId = new Map<string, number>();
    for (const uid of chatRecipientIds) unreadChatCountByUserId.set(uid, 0);

    if (chatRecipientIds.length > 0) {
      const { data: p1Rows } = await supabase
        .from("user_chats_summary")
        .select("participant_1_id, unread_count_p1")
        .in("participant_1_id", chatRecipientIds);

      if (p1Rows) {
        for (const row of p1Rows as any[]) {
          const uid = row.participant_1_id as string;
          const prev = unreadChatCountByUserId.get(uid) ?? 0;
          unreadChatCountByUserId.set(uid, prev + (row.unread_count_p1 || 0));
        }
      }

      const { data: p2Rows } = await supabase
        .from("user_chats_summary")
        .select("participant_2_id, unread_count_p2")
        .in("participant_2_id", chatRecipientIds);

      if (p2Rows) {
        for (const row of p2Rows as any[]) {
          const uid = row.participant_2_id as string;
          const prev = unreadChatCountByUserId.get(uid) ?? 0;
          unreadChatCountByUserId.set(uid, prev + (row.unread_count_p2 || 0));
        }
      }
    }

    // Process chat notifications
    for (const [userId, chatNotifications] of chatNotificationsByUser) {
      try {
        const settings = chatSettingsByUserId.get(userId);
        if (!settings?.push_token || settings.notify_chats !== true) {
          continue;
        }

        const pushToken = settings.push_token;
        const latestChat = chatNotifications[0];
        const senderId = latestChat.related_user_id;

        if (!senderId) {
          continue; // Skip if no sender
        }

        // CRITICAL: Mark notifications as sent BEFORE sending to prevent race conditions
        // This ensures that if the function is called multiple times, only one will process
        const notificationIds = chatNotifications.map((n) => n.id);
        const { error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false"); // Only update if not already sent (prevents race conditions)

        // If update failed or no rows were updated, notifications were already sent by another instance
        if (updateError) {
          console.error(`Error marking notifications as sent for user ${userId}:`, updateError);
          continue; // Skip this batch - likely already processed
        }

        // Double-check: fetch again to ensure we actually got the notifications
        const { data: verifyNotifications } = await supabase
          .from("notifications")
          .select("id")
          .in("id", notificationIds)
          .eq("push_sent", true);

        // If no notifications were actually marked as sent, skip (another instance got them)
        if (!verifyNotifications || verifyNotifications.length === 0) {
          continue;
        }

        const senderUsername = senderUsernameById.get(senderId) ?? "Someone";
        const messageBody = truncateMessage(latestChat.message || "Sent a message");
        const unreadChatCount = unreadChatCountByUserId.get(userId) ?? 0;

        const pushPayload = {
          to: pushToken,
          title: senderUsername,
          body: messageBody,
          sound: "default",
          badge: unreadChatCount, // Only chat messages increment badge
          data: {
            notificationId: latestChat.id,
            type: "chat_message",
            relatedUserId: senderId, // So client can suppress banner when viewing this chat
          },
        };

        const pushResponse = await fetch(EXPO_PUSH_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(pushPayload),
        });

        if (!pushResponse.ok) {
          const errorText = await pushResponse.text();
          // If send failed, mark as not sent so it can be retried
          await supabase
            .from("notifications")
            .update({ push_sent: false })
            .in("id", notificationIds);
          throw new Error(`Expo Push API error: ${pushResponse.status} - ${errorText}`);
        }

        const pushResult = await pushResponse.json();

        if (pushResult.data?.status === "ok") {
          results.push({
            userId,
            notificationCount: chatNotifications.length,
            status: "sent",
          });
        } else {
          // If Expo API returned error, mark as not sent for retry
          await supabase
            .from("notifications")
            .update({ push_sent: false })
            .in("id", notificationIds);
          errors.push({
            userId,
            error: String(pushResult.data?.message ?? "Unknown error"),
          });
        }
      } catch (error: any) {
        errors.push({
          userId,
          error: (error?.message as string) || "Failed to send push notification",
        });
      }
    }

    // Process vote notifications (separate from chat, badge = 0)
    for (const [userId, voteNotifications] of voteNotificationsByUser) {
      try {
        const settings = voteSettingsByUserId.get(userId);
        if (!settings?.push_token || settings.notify_upvotes !== true) {
          continue;
        }

        const pushToken = settings.push_token;
        const voteCount = voteNotifications.length;

        // CRITICAL: Mark notifications as sent BEFORE sending to prevent race conditions
        const notificationIds = voteNotifications.map((n) => n.id);
        const { error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false"); // Only update if not already sent

        if (updateError) {
          console.error(`Error marking vote notifications as sent for user ${userId}:`, updateError);
          continue;
        }

        // Verify notifications were actually marked
        const { data: verifyNotifications } = await supabase
          .from("notifications")
          .select("id")
          .in("id", notificationIds)
          .eq("push_sent", true);

        if (!verifyNotifications || verifyNotifications.length === 0) {
          continue; // Already processed by another instance
        }

        const pushPayload = {
          to: pushToken,
          title: "Your post got voted!",
          body: voteNotifications[0].message, // Use actual milestone message from DB (e.g., "Your post received 10 upvotes!")
          sound: "default",
          badge: 0, // Votes do NOT increment device badge
          data: {
            notificationId: voteNotifications[0].id,
            type: "upvote",
            relatedPostId: voteNotifications[0].related_post_id, // Enable routing to post detail
          },
        };

        // Send push notification via Expo Push API
        const pushResponse = await fetch(EXPO_PUSH_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(pushPayload),
        });

        if (!pushResponse.ok) {
          const errorText = await pushResponse.text();
          // Mark as not sent for retry
          await supabase
            .from("notifications")
            .update({ push_sent: false })
            .in("id", notificationIds);
          throw new Error(`Expo Push API error: ${pushResponse.status} - ${errorText}`);
        }

        const pushResult = await pushResponse.json();

        if (pushResult.data?.status === "ok") {
          results.push({
            userId,
            notificationCount: voteCount,
            status: "sent",
          });
        } else {
          // Mark as not sent for retry
          await supabase
            .from("notifications")
            .update({ push_sent: false })
            .in("id", notificationIds);
          errors.push({
            userId,
            error: String(pushResult.data?.message ?? "Unknown error"),
          });
        }
      } catch (error: any) {
        errors.push({
          userId,
          error: (error?.message as string) || "Failed to send push notification",
        });
      }
    }

    // Process comment_reply notifications
    for (const [userId, commentNotifications] of commentNotificationsByUser) {
      try {
        // Comment notifications ship "Always On" (Phase 1); settings toggle added in Phase 2
        const pushToken = await supabase
          .from("notification_settings")
          .select("push_token")
          .eq("user_id", userId)
          .maybeSingle()
          .then(({ data }) => data?.push_token);

        if (!pushToken) {
          continue; // Skip if no push token
        }

        // CRITICAL: Mark notifications as sent BEFORE sending to prevent race conditions
        const notificationIds = commentNotifications.map((n) => n.id);
        const { error: updateError } = await supabase
          .from("notifications")
          .update({ push_sent: true })
          .in("id", notificationIds)
          .or("push_sent.is.null,push_sent.eq.false"); // Only update if not already sent

        if (updateError) {
          console.error(`Error marking comment notifications as sent for user ${userId}:`, updateError);
          continue;
        }

        // Verify notifications were actually marked
        const { data: verifyNotifications } = await supabase
          .from("notifications")
          .select("id")
          .in("id", notificationIds)
          .eq("push_sent", true);

        if (!verifyNotifications || verifyNotifications.length === 0) {
          continue; // Already processed by another instance
        }

        const pushPayload = {
          to: pushToken,
          title: "New comment",
          body: commentNotifications[0].message, // "Your post received a new comment."
          sound: "default",
          badge: 0, // Comments do NOT increment device badge
          data: {
            notificationId: commentNotifications[0].id,
            type: "comment_reply",
            relatedPostId: commentNotifications[0].related_post_id, // Enable routing to post detail
          },
        };

        // Send push notification via Expo Push API
        const pushResponse = await fetch(EXPO_PUSH_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(pushPayload),
        });

        if (!pushResponse.ok) {
          const errorText = await pushResponse.text();
          // Mark as not sent for retry
          await supabase
            .from("notifications")
            .update({ push_sent: false })
            .in("id", notificationIds);
          throw new Error(`Expo Push API error: ${pushResponse.status} - ${errorText}`);
        }

        const pushResult = await pushResponse.json();

        if (pushResult.data?.status === "ok") {
          results.push({
            userId,
            notificationCount: commentNotifications.length,
            status: "sent",
          });
        } else {
          // Mark as not sent for retry
          await supabase
            .from("notifications")
            .update({ push_sent: false })
            .in("id", notificationIds);
          errors.push({
            userId,
            error: String(pushResult.data?.message ?? "Unknown error"),
          });
        }
      } catch (error: any) {
        errors.push({
          userId,
          error: (error?.message as string) || "Failed to send comment push notification",
        });
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
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-push-notification:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      }
    );
  }
});
