import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

const SENSITIVE_PARAMS = ["code", "token", "access_token", "refresh_token"];

function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const param of SENSITIVE_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[Filtered]");
        changed = true;
      }
    }
    return changed ? parsed.toString() : url;
  } catch {
    return url.replace(
      new RegExp(`([?&])(${SENSITIVE_PARAMS.join("|")})=[^&#]*`, "gi"),
      "$1$2=[Filtered]",
    );
  }
}

export function initSentry() {
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!sentryDsn) {
    console.warn(
      "[Sentry] DSN not found. Set EXPO_PUBLIC_SENTRY_DSN in your environment variables."
    );
    return;
  }

  if (__DEV__) {
    console.log("[Sentry] Skipping initialization in development mode");
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: "production",
    debug: false,
    tracesSampleRate: 0.1,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,

    beforeSend(event) {
      // Scrub auth codes from the request URL and query string so password
      // recovery ?code= parameters never appear in Sentry error events.
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url);
      }
      if (event.request?.query_string && typeof event.request.query_string === "string") {
        event.request.query_string = scrubUrl(`?${event.request.query_string}`).replace(/^\?/, "");
      }
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // Scrub auth codes from navigation and XHR breadcrumbs that Sentry
      // auto-captures, which may include the full deep-link URL.
      if (breadcrumb.data?.url && typeof breadcrumb.data.url === "string") {
        breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
      }
      if (breadcrumb.data?.to && typeof breadcrumb.data.to === "string") {
        breadcrumb.data.to = scrubUrl(breadcrumb.data.to);
      }
      if (breadcrumb.data?.from && typeof breadcrumb.data.from === "string") {
        breadcrumb.data.from = scrubUrl(breadcrumb.data.from);
      }
      return breadcrumb;
    },
  });

  console.log("[Sentry] Initialized successfully");
}
