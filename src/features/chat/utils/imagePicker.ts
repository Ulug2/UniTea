import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { logger } from "../../../utils/logger";

/**
 * Pick an image from the library for chat without cropping or preprocessing.
 * Returns local URI or null if cancelled.
 */
export async function pickChatImage(): Promise<{ localUri: string } | null> {
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

    return { localUri: result.assets[0].uri };
  } catch (error) {
    logger.error("Error picking chat image", error as Error);
    Alert.alert("Error", "Failed to pick image. Please try again.");
    return null;
  }
}
