import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { logger } from "../../../utils/logger";

/**
 * Pick an image from the library for chat without cropping or preprocessing.
 * Returns the local URI and the image's aspect ratio (width / height), read
 * synchronously from the picker result — no Image.getSize round trip needed.
 * aspectRatio is null if the picker didn't report dimensions (rare, but
 * happens on some Android providers); callers fall back to measuring later.
 */
export async function pickChatImage(): Promise<
  { localUri: string; aspectRatio: number | null } | null
> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photo library to attach images."
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const aspectRatio =
      asset.width && asset.height && asset.height > 0
        ? asset.width / asset.height
        : null;

    return { localUri: asset.uri, aspectRatio };
  } catch (error) {
    logger.error("Error picking chat image", error as Error);
    Alert.alert("Error", "Failed to pick image. Please try again.");
    return null;
  }
}
