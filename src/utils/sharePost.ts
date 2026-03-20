import { Share, Platform, Alert } from "react-native";

const APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://unitea.app";

/**
 * Returns the public URL for a regular feed post.
 */
export function getPostShareUrl(postId: string): string {
  const base = APP_URL.replace(/\/$/, "");
  return `${base}/post/${postId}`;
}

/**
 * Returns the public URL for a Lost & Found post.
 */
export function getLostFoundShareUrl(postId: string): string {
  const base = APP_URL.replace(/\/$/, "");
  // Use the same `/post/<id>` universal-link path as regular feed posts.
  // Deep-link router will look for `postType=lost_found` and redirect
  // to the dedicated lost&found detail screen.
  const encodedId = encodeURIComponent(postId);
  return `${base}/post/${encodedId}?postType=lost_found`;
}

const SHARE_TITLE = "Share Post";
const SHARE_MESSAGE = "Check out this post on UniTee!";

/**
 * Opens the native share sheet (or copies link on web).
 * Pass postType="lost_found" for L&F posts so the shared link
 * deep-links directly to the L&F detail screen.
 */
export async function sharePost(postId: string, postType?: string): Promise<void> {
  const url = postType === "lost_found"
    ? getLostFoundShareUrl(postId)
    : getPostShareUrl(postId);

  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: SHARE_TITLE,
          text: SHARE_MESSAGE,
          url,
        });
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        // Fallback: copy to clipboard
        await copyToClipboardWeb(url);
      }
    } else {
      await copyToClipboardWeb(url);
    }
    return;
  }

  // Native (iOS / Android)
  try {
    if (Platform.OS === "ios") {
      await Share.share({
        message: SHARE_MESSAGE,
        url,
        title: SHARE_TITLE,
      });
    } else {
      const message = `${SHARE_MESSAGE}\n\n${url}`;
      await Share.share({ message, title: SHARE_TITLE, url });
    }
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") return;
    Alert.alert("Error", "Could not open share. Try again.");
  }
}

function copyToClipboardWeb(url: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(url).then(() => {
      Alert.alert("Link copied", "Post link copied to clipboard.");
    });
  }
  return Promise.resolve();
}
