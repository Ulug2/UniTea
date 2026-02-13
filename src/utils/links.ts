import { Linking } from "react-native";

export async function openExternalLink(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error("Unable to open link");
  }
  await Linking.openURL(url);
}

