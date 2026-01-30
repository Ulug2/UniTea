import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { logger } from "../utils/logger";

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

async function registerForPushNotificationsAsync() {
    if (!Device.isDevice) {
        logger.info("Must use physical device for Push Notifications");
        return null;
    }

    const expoProjectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

    if (!expoProjectId) {
        logger.warn("Expo projectId is missing. Make sure it is set in app.json / app.config.");
        return null; // Return early if projectId is missing
    }

    const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== "granted") {
        logger.warn("Failed to get push token for push notification!");
        return null;
    }

    try {
        const token = await Notifications.getExpoPushTokenAsync({
            projectId: expoProjectId,
        });
        logger.info("Push notification token obtained successfully");
        return token.data;
    } catch (error) {
        logger.error("Error getting Expo push token", error as Error);
        return null;
    }
}

export function usePushNotifications() {
    const { session } = useAuth();
    const userId = session?.user?.id;

    useEffect(() => {
        if (!userId) return;

        let isMounted = true;

        const setup = async () => {
            try {
                const pushToken = await registerForPushNotificationsAsync();

                if (!isMounted || !pushToken) return;

                // Add timeout wrapper for the Supabase call (10 second timeout)
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Request timeout')), 10000);
                });

                const supabasePromise = supabase
                    .from("notification_settings")
                    .upsert(
                        {
                            user_id: userId,
                            push_token: pushToken,
                        },
                        { onConflict: "user_id" }
                    );

                const result = await Promise.race([supabasePromise, timeoutPromise]) as any;

                if (result?.error) {
                    logger.error(
                        "Error saving push token to notification_settings",
                        result.error as Error,
                        { userId }
                    );
                } else {
                    logger.info("Push token saved successfully", { userId });
                }
            } catch (error: any) {
                // Silently handle timeout/network errors - don't crash the app
                if (error?.message === 'Request timeout') {
                    logger.warn("Push token save timed out - will retry on next app open", {
                        userId,
                    });
                } else {
                    logger.error("Error in push notification setup", error as Error, {
                        userId,
                    });
                }
            }
        };

        setup();

        return () => {
            isMounted = false;
        };
    }, [userId]);
}

