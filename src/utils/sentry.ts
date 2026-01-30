import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/**
 * Initialize Sentry for error tracking and monitoring
 * Only initializes in production builds (not in development)
 */
export function initSentry() {
  // Get Sentry DSN from environment variables
  // You'll need to set EXPO_PUBLIC_SENTRY_DSN in your .env or app.json
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!sentryDsn) {
    console.warn(
      "[Sentry] DSN not found. Set EXPO_PUBLIC_SENTRY_DSN in your environment variables."
    );
    return;
  }

  // Only initialize in production (not in development to avoid noise)
  if (__DEV__) {
    console.log("[Sentry] Skipping initialization in development mode");
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: "production",
    debug: false, // Set to true for debugging Sentry itself
    tracesSampleRate: 0.1, // 10% of transactions will be sent (adjust based on volume)
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000, // Track sessions every 30 seconds
    beforeSend(event, hint) {
      // Filter out sensitive data or noisy errors if needed
      // You can modify or drop events here before they're sent
      return event;
    },
    // Tracing is automatically enabled in v7.x with tracesSampleRate
    // No need to manually add ReactNativeTracing integration
  });

  console.log("[Sentry] Initialized successfully");
}
