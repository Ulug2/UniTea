# Send Push Notification Edge Function

This Edge Function sends push notifications to users via Expo Push API when new notifications are created in the database.

## Setup

1. **Deploy the function:**
   ```bash
   supabase functions deploy send-push-notification
   ```

2. **Set up a database webhook or cron job** to call this function periodically:
   - Option A: Use Supabase Database Webhooks (recommended)
     - Go to Supabase Dashboard > Database > Webhooks
     - Create a webhook on `notifications` table INSERT events
     - Set URL to: `https://<your-project-ref>.supabase.co/functions/v1/send-push-notification`
   
   - Option B: Use a cron job (e.g., via Supabase Cron extension or external service)
     - Call the function every 30-60 seconds to process pending notifications

## How It Works

1. The function fetches unread notifications from the `notifications` table
2. Groups notifications by user
3. Fetches each user's push token from `notification_settings`
4. Sends push notifications via Expo Push API
5. Returns results indicating success/failure for each user

## Environment Variables

The function uses these Supabase environment variables (automatically available):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## API Endpoint

- **URL:** `https://<your-project-ref>.supabase.co/functions/v1/send-push-notification`
- **Method:** POST
- **Headers:** 
  - `Authorization: Bearer <anon-key>` (optional, but recommended)

## Response Format

```json
{
  "success": true,
  "sent": 5,
  "errors": 0,
  "results": [
    {
      "userId": "uuid",
      "notificationCount": 2,
      "status": "sent"
    }
  ]
}
```

## Integration with Database Triggers

This function works in conjunction with the notification triggers created in `sql/create_notification_triggers.sql`:

1. Database triggers create notification records in the `notifications` table
2. This Edge Function processes those records and sends push notifications
3. The function can be called via webhook (on INSERT) or cron job (periodic polling)

## Notes

- The function processes up to 100 notifications at a time
- Notifications are grouped by user to avoid sending multiple push notifications
- Users without push tokens are skipped
- The function is idempotent - safe to call multiple times

## Troubleshooting: "I'm not getting push notifications"

1. **The Edge Function is not called automatically.** Database triggers only insert rows into `notifications`; they do not call this function. You must:
   - Set up a **Database Webhook** on `notifications` INSERT that POSTs to this function, or
   - Run a **cron job** (e.g. every 30–60 seconds) that POSTs to this function.
2. **App icon badge:** The app sets the badge from the chat unread count when the user is in the app. For the badge to show on the home screen, ensure `shouldSetBadge: true` in the notification handler (see `src/hooks/usePushNotifications.ts`) and that the device allows badge for the app.
