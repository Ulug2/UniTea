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

    // Get unread notifications that haven't been sent yet (deduplication)
    // We'll use a webhook approach: fetch recent notifications and send push notifications
    const { data: notifications, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .eq("is_read", false)
      .eq("push_sent", false) // Only fetch notifications that haven't been sent yet
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

    // Separate notifications by type: chat vs votes
    const chatNotificationsByUser = new Map<string, NotificationRecord[]>();
    const voteNotificationsByUser = new Map<string, NotificationRecord[]>();

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
      }
      // Skip comment_reply for now (not in requirements)
    }

    const results: { userId: string; notificationCount: number; status: string }[] = [];
    const errors: { userId: string; error: string }[] = [];

    // Helper: Get sender username for chat notifications
    const getSenderUsername = async (userId: string): Promise<string> => {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .single();
      return data?.username || "Someone";
    };

    // Helper: Truncate message to MAX_MESSAGE_LENGTH
    const truncateMessage = (message: string): string => {
      if (message.length <= MAX_MESSAGE_LENGTH) return message;
      return message.substring(0, MAX_MESSAGE_LENGTH) + "...";
    };

    // Helper: Get unread chat message count for badge (count from chat_messages, not notifications)
    // This reflects the actual server-side count of unread messages for the user
    const getUnreadChatCount = async (userId: string): Promise<number> => {
      // Count unread messages from user_chats_summary view (optimized)
      const { data: chatSummaries, error } = await supabase
        .from("user_chats_summary")
        .select("unread_count_p1, unread_count_p2, participant_1_id, participant_2_id")
        .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`);

      if (error) {
        console.error(`Error counting unread chats for user ${userId}:`, error);
        return 0;
      }

      if (!chatSummaries) return 0;

      // Sum unread counts based on which participant is the user
      const total = chatSummaries.reduce((sum: number, chat: any) => {
        const isP1 = chat.participant_1_id === userId;
        const unread = isP1 ? (chat.unread_count_p1 || 0) : (chat.unread_count_p2 || 0);
        return sum + unread;
      }, 0);

      return total;
    };

    // Process chat notifications
    for (const [userId, chatNotifications] of chatNotificationsByUser) {
      try {
        const { data: settings, error: settingsError } = await supabase
          .from("notification_settings")
          .select("push_token")
          .eq("user_id", userId)
          .single();

        if (settingsError || !settings?.push_token) {
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
          .eq("push_sent", false); // Only update if not already sent (prevents race conditions)

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

        const senderUsername = await getSenderUsername(senderId);
        const messageBody = truncateMessage(latestChat.message || "Sent a message");
        const unreadChatCount = await getUnreadChatCount(userId);

        const pushPayload = {
          to: pushToken,
          title: senderUsername,
          body: messageBody,
          sound: "default",
          badge: unreadChatCount, // Only chat messages increment badge
          data: {
            notificationId: latestChat.id,
            type: "chat_message",
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
        const { data: settings, error: settingsError } = await supabase
          .from("notification_settings")
          .select("push_token")
          .eq("user_id", userId)
          .single();

        if (settingsError || !settings?.push_token) {
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
          .eq("push_sent", false); // Only update if not already sent

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
          body: `You received ${voteCount} new vote${voteCount > 1 ? "s" : ""}`,
          sound: "default",
          badge: 0, // Votes do NOT increment device badge
          data: {
            notificationId: voteNotifications[0].id,
            type: "upvote",
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
