import * as Sentry from "@sentry/react-native";

/**
 * Centralized logging utility that sends logs to Sentry in production
 * and console in development
 */
class Logger {
  private isDevelopment = __DEV__;

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, any>) {
    if (this.isDevelopment) {
      console.log(`[INFO] ${message}`, metadata || "");
    } else {
      Sentry.addBreadcrumb({
        message,
        level: "info",
        data: metadata,
      });
    }
  }

  /**
   * Log a warning
   */
  warn(message: string, metadata?: Record<string, any>) {
    if (this.isDevelopment) {
      console.warn(`[WARN] ${message}`, metadata || "");
    } else {
      Sentry.addBreadcrumb({
        message,
        level: "warning",
        data: metadata,
      });
      Sentry.captureMessage(message, {
        level: "warning",
        extra: metadata,
      });
    }
  }

  /**
   * Log an error
   */
  error(message: string, error?: Error | any, metadata?: Record<string, any>) {
    if (this.isDevelopment) {
      console.error(`[ERROR] ${message}`, error || "", metadata || "");
    } else {
      if (error instanceof Error) {
        Sentry.captureException(error, {
          tags: metadata,
          extra: {
            message,
            ...metadata,
          },
        });
      } else {
        Sentry.captureMessage(message, {
          level: "error",
          extra: {
            error,
            ...metadata,
          },
        });
      }
    }
  }

  /**
   * Set user context for Sentry (helps identify which user encountered an error)
   */
  setUser(userId: string | null, email?: string, username?: string) {
    if (!this.isDevelopment) {
      Sentry.setUser({
        id: userId || undefined,
        email: email || undefined,
        username: username || undefined,
      });
    }
  }

  /**
   * Clear user context
   */
  clearUser() {
    if (!this.isDevelopment) {
      Sentry.setUser(null);
    }
  }

  /**
   * Add breadcrumb (useful for tracking user actions)
   */
  breadcrumb(message: string, category: string, data?: Record<string, any>) {
    if (this.isDevelopment) {
      console.log(`[BREADCRUMB] [${category}] ${message}`, data || "");
    } else {
      Sentry.addBreadcrumb({
        message,
        category,
        data,
        level: "info",
      });
    }
  }
}

export const logger = new Logger();
