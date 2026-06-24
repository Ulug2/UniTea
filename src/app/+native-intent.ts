import * as Linking from "expo-linking";

/**
 * Rewrites incoming deep links before Expo Router navigates.
 *
 * Lost & Found posts are shared with the universal `/post/<id>?postType=lost_found`
 * path (so a single App Links / Universal Links entry covers every post). Without
 * this rewrite, the OS would first open the regular `/post/<id>` screen and only
 * afterwards redirect to the dedicated L&F screen, causing a visible flash and an
 * inconsistent back-stack. Resolving the path here routes straight to
 * `/lostfoundpost/<id>` on both cold and warm starts.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const parsed = Linking.parse(path);
    if (!parsed.path) return path;

    const segments = parsed.path.split("/").filter(Boolean);
    const queryParams = (parsed as { queryParams?: Record<string, unknown> })
      .queryParams ?? {};

    const readParam = (key: string): string | undefined => {
      const v = queryParams[key];
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
      return undefined;
    };

    // `Linking.parse` does not always populate `queryParams`; fall back to the
    // raw path string so the rewrite is resilient across platforms.
    const readFromRaw = (key: string): string | undefined => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = path.match(new RegExp(`[?&]${escaped}=([^&#]+)`));
      if (!m) return undefined;
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    };

    const postType =
      readParam("postType") ??
      readParam("post_type") ??
      readParam("type") ??
      readFromRaw("postType") ??
      readFromRaw("post_type") ??
      readFromRaw("type");

    if (segments[0] === "post" && segments[1]) {
      if (postType === "lost_found") {
        return `/lostfoundpost/${segments[1]}?fromDeeplink=1`;
      }
      // Regular post deep link — append fromDeeplink so the detail screen can
      // show contextual error copy and handle empty back-stack on cold start.
      return `/post/${segments[1]}?fromDeeplink=1`;
    }
  } catch {
    // Fall through to default handling on any parse error.
  }

  return path;
}
