import { Linking } from "react-native";

/**
 * Opens an external https link in the user's browser (or the app that owns
 * the link). Deliberately no Linking.canOpenURL pre-check: on some Android
 * devices it reports false for plain https links even though a browser can
 * open them (package-visibility / OEM browser quirks), which blocked Terms &
 * Privacy for those users. openURL itself rejects when nothing can handle
 * the link, so that is the only failure signal needed.
 */
export async function openExternalLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    throw new Error("Unable to open link. Please try again later.");
  }
}
