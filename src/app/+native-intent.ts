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

    // For a custom URL scheme (myunitea://post/abc), Linking.parse treats the
    // first path component as `hostname`, not `path` — e.g.
    // { hostname: "post", path: "abc" } — whereas for https:// Universal
    // Links the same position is the real domain and the route name stays in
    // `path` (e.g. { hostname: "unitea.app", path: "post/abc" }). Without
    // accounting for this, myunitea://reset-password?token_hash=... (used by
    // the web fallback page's deep-link handoff) silently fails to match any
    // branch below and falls through unrewritten.
    const isCustomScheme =
      !!parsed.scheme && parsed.scheme !== "https" && parsed.scheme !== "http";
    const effectivePath = isCustomScheme
      ? [parsed.hostname, parsed.path].filter(Boolean).join("/")
      : parsed.path;

    if (!effectivePath) return path;

    const segments = effectivePath.split("/").filter(Boolean);
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

    // Password recovery deep link: /reset-password?token_hash=XXXXX&type=recovery
    // (or the legacy ?code=XXXXX PKCE form). Routes to the standalone
    // reset-password screen, which gates verification behind an explicit tap
    // before exchanging the token/code, then handles the password update and
    // global session invalidation.
    if (segments[0] === "reset-password") {
      const tokenHash = readParam("token_hash") ?? readFromRaw("token_hash");
      if (tokenHash) {
        return `/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
      }
      const code = readParam("code") ?? readFromRaw("code");
      if (code) {
        return `/reset-password?code=${encodeURIComponent(code)}`;
      }
      // No token — screen will show the expired/invalid link state.
      return "/reset-password";
    }
  } catch {
    // Fall through to default handling on any parse error.
  }

  return path;
}
