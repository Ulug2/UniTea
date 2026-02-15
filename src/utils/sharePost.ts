import { Share, Platform, Alert } from "react-native";

const APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://unitea.app";

/**
 * Returns the public URL for a post. Opening this link shows the post (web or app via universal link).
 */
export function getPostShareUrl(postId: string): string {
  const base = APP_URL.replace(/\/$/, "");
  return `${base}/post/${postId}`;
}

const SHARE_TITLE = "Share Post";
const SHARE_MESSAGE = "Check out this post on UniTee!";

/**
 * Opens the native share sheet (or copies link on web) so the user can send the post link.
 */
export async function sharePost(postId: string): Promise<void> {
  const url = getPostShareUrl(postId);

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
