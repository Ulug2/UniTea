import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { logger } from "../utils/logger";

// Track app state to suppress notifications when app is in foreground
// Using module-level variable so notification handler can access it
let currentAppState: AppStateStatus = AppState.currentState;

// Set up AppState listener at module level to track foreground/background state
// This ensures the listener is active from app startup, regardless of hook usage
const appStateSubscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
    currentAppState = nextAppState;
});

// Set notification handler to suppress notifications when app is in foreground
// This handler is called each time a notification arrives, so it reads currentAppState at that moment
Notifications.setNotificationHandler({
    handleNotification: async () => {
        const isAppInForeground = currentAppState === "active";
        
        // When app is in foreground, suppress all notification UI but still update badge
        if (isAppInForeground) {
            return {
                shouldShowAlert: false,
                shouldPlaySound: false,
                shouldSetBadge: true, // Still update badge count
                shouldShowBanner: false,
                shouldShowList: false,
            };
        }
        
        // When app is in background or inactive, show notifications normally
        return {
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
        };
    },
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

