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

// Track which chat screen is currently viewed (other user id) so we can suppress
// in-app banners for messages from that chat only
let currentViewedChatPartnerId: string | null = null;

export function setCurrentViewedChatPartnerId(partnerId: string | null) {
    currentViewedChatPartnerId = partnerId;
}

// Set up AppState listener at module level to track foreground/background state
// This ensures the listener is active from app startup, regardless of hook usage
const appStateSubscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
    currentAppState = nextAppState;
});

function getNotificationData(notification: Notifications.Notification): { type?: string; relatedUserId?: string } {
    const contentData = notification.request.content.data as Record<string, unknown> | undefined;
    const trigger = notification.request.trigger as { remoteMessage?: { data?: Record<string, string> } } | undefined;
    const remoteData = trigger?.remoteMessage?.data;
    return {
        type: (contentData?.type as string) ?? remoteData?.type,
        relatedUserId: (contentData?.relatedUserId as string) ?? remoteData?.relatedUserId,
    };
}

// Set notification handler: show chat message banners in foreground except when viewing that chat
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const isAppInForeground = currentAppState === "active";
        const { type, relatedUserId } = getNotificationData(notification);
        const isChatMessage = type === "chat_message";
        const isViewingThisChat =
            isChatMessage &&
            relatedUserId != null &&
            currentViewedChatPartnerId != null &&
            currentViewedChatPartnerId === relatedUserId;

        // When app is in foreground: show chat message banners unless user is viewing that chat
        if (isAppInForeground) {
            if (isChatMessage && !isViewingThisChat) {
                return {
                    shouldShowAlert: true,
                    shouldPlaySound: true,
                    shouldSetBadge: true,
                    shouldShowBanner: true,
                    shouldShowList: true,
                };
            }
            // If we can't determine type (e.g. data missing on some platforms), show banner so chat messages aren't missed
            if (type == null && (notification.request.content.title != null || notification.request.content.body != null)) {
                return {
                    shouldShowAlert: true,
                    shouldPlaySound: true,
                    shouldSetBadge: true,
                    shouldShowBanner: true,
                    shouldShowList: true,
                };
            }
            if (!isChatMessage) {
                return {
                    shouldShowAlert: false,
                    shouldPlaySound: false,
                    shouldSetBadge: true,
                    shouldShowBanner: false,
                    shouldShowList: false,
                };
            }
            // Viewing this chat – suppress banner
            return {
                shouldShowAlert: false,
                shouldPlaySound: false,
                shouldSetBadge: true,
                shouldShowBanner: false,
                shouldShowList: false,
            };
        }

        // When app is in background or inactive, show all notifications normally
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

