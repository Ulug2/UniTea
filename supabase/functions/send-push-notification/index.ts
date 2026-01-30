import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get unread notifications that haven't been sent yet
    // We'll use a webhook approach: fetch recent notifications and send push notifications
    const { data: notifications, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .eq("is_read", false)
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

    // Group notifications by user to batch push notifications
    const notificationsByUser = new Map<string, NotificationRecord[]>();
    for (const notification of notifications) {
      const userId = notification.user_id;
      if (!notificationsByUser.has(userId)) {
        notificationsByUser.set(userId, []);
      }
      notificationsByUser.get(userId)!.push(notification);
    }

    const results: { userId: string; notificationCount: number; status: string }[] = [];
    const errors: { userId: string; error: string }[] = [];

    // Process each user's notifications
    for (const [userId, userNotifications] of notificationsByUser) {
      try {
        // Get user's push token from notification_settings
        const { data: settings, error: settingsError } = await supabase
          .from("notification_settings")
          .select("push_token")
          .eq("user_id", userId)
          .single();

        if (settingsError || !settings?.push_token) {
          // User doesn't have a push token, skip
          continue;
        }

        const pushToken = settings.push_token;

        // Get the most recent notification for title
        const latestNotification = userNotifications[0];
        const notificationCount = userNotifications.length;

        // Prepare push notification payload
        const pushPayload = {
          to: pushToken,
          title: notificationCount === 1
            ? latestNotification.message
            : `${notificationCount} new notifications`,
          body: notificationCount === 1
            ? latestNotification.message
            : `You have ${notificationCount} new notifications`,
          sound: "default",
          badge: notificationCount,
          data: {
            notificationId: latestNotification.id,
            type: latestNotification.type,
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
          throw new Error(`Expo Push API error: ${pushResponse.status} - ${errorText}`);
        }

        const pushResult = await pushResponse.json();

        // Check if push was successful
        if (pushResult.data?.status === "ok") {
          // Mark notifications as sent (we could add a 'sent' field, but for now we'll just log)
          results.push({
            userId,
            notificationCount,
            status: "sent",
          });
        } else {
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
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
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
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
