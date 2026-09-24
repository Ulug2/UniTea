import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { logger } from "../../../utils/logger";
import {
  COMPRESSED_IMAGE_MIME_TYPE,
  compressImageForUpload,
} from "../../../utils/imageCompression";

/**
 * Pick an image from the library for chat (no cropping) and compress it with
 * the shared upload pipeline (max 1080px wide, WebP). Returns the local URI,
 * its type metadata for uploadImage(), and the aspect ratio (width / height)
 * from the picker result — resizing preserves it, so no Image.getSize round
 * trip is needed. aspectRatio is null if the picker didn't report dimensions
 * (rare, some Android providers); callers fall back to measuring later.
 * If compression fails, the original image is sent rather than failing.
 */
export async function pickChatImage(): Promise<
  {
    localUri: string;
    mimeType: string | null;
    fileName: string | null;
    aspectRatio: number | null;
  } | null
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

    try {
      const compressedUri = await compressImageForUpload(asset.uri, asset.width);
      return {
        localUri: compressedUri,
        mimeType: COMPRESSED_IMAGE_MIME_TYPE,
        fileName: null,
        aspectRatio,
      };
    } catch (compressError) {
      logger.warn("Chat image compression failed; sending original", {
        message: compressError instanceof Error ? compressError.message : String(compressError),
      });
      return {
        localUri: asset.uri,
        mimeType: asset.mimeType ?? null,
        fileName: asset.fileName ?? null,
        aspectRatio,
      };
    }
  } catch (error) {
    logger.error("Error picking chat image", error as Error);
    Alert.alert("Error", "Failed to pick image. Please try again.");
    return null;
  }
}
