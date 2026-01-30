import * as SplashScreen from "expo-splash-screen";
import { logger } from "./logger";

/**
 * Hides the native splash screen. Never throws - all errors are caught and logged.
 * Safe to call without await (won't create unhandled promise rejections).
 * The promise always resolves (never rejects) to prevent unhandled rejections.
 * 
 * Note: React Native may still log "Uncaught (in promise)" errors at the native bridge level
 * before JavaScript can catch them. These errors are harmless and can be ignored.
 */
export function hideSplashSafe(): Promise<void> {
  // Immediately attach catch handler to prevent unhandled rejection
  const promise = SplashScreen.hideAsync();
  
  // Attach error handler immediately (before any other code runs)
  promise.catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    // Handle all splash screen related errors - these are non-critical
    if (
      msg.includes("No native splash screen registered") ||
      msg.includes("SplashScreen.show") ||
      msg.includes("view controller") ||
      msg.includes("Call 'SplashScreen.show'")
    ) {
      // VC mismatch or already hidden (non-critical) - common when navigating to Auth
      logger.warn("[Splash] Attempted to hide splash from wrong view controller", e as Error);
      return;
    }
    // Log other errors
    logger.error("[Splash] Failed to hide splash screen", e as Error);
  });

  // Return a promise that always resolves
  return promise.then(
    () => undefined,
    (e: unknown) => {
      // Error already logged above, just resolve
      return undefined;
    }
  );
}
