import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { logger } from "../../../utils/logger";

const RESIZE_WIDTH = 1080;
const COMPRESS = 0.7;

/**
 * Pick an image from the library for chat. Resizes to 1080px width, compresses as WEBP.
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
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return null;

    const manipResult = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: RESIZE_WIDTH } }],
      {
        compress: COMPRESS,
        format: ImageManipulator.SaveFormat.WEBP,
      }
    );

    return { localUri: manipResult.uri };
  } catch (error) {
    logger.error("Error picking chat image", error as Error);
    Alert.alert("Error", "Failed to pick image. Please try again.");
    return null;
  }
}
