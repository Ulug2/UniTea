import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { logger } from "../../../utils/logger";
import { mapWithConcurrency } from "../../../utils/asyncConcurrency";
import {
  COMPRESSED_IMAGE_MIME_TYPE,
  compressImageForUpload,
} from "../../../utils/imageCompression";
import type { PickedChatImage } from "../types";

const COMPRESSION_CONCURRENCY = 2;

async function toPickedChatImage(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedChatImage> {
  const aspectRatio =
    asset.width && asset.height && asset.height > 0 ? asset.width / asset.height : null;
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
}

/**
 * Pick up to `maxCount` images from the library for chat (no cropping) and
 * compress each with the shared upload pipeline (max 1080px wide, WebP).
 * Resizing preserves the aspect ratio read from the picker result, so no
 * Image.getSize round trip is needed; it is null if the picker didn't report
 * dimensions (rare, some Android providers). If compressing an image fails,
 * that image's original file is used rather than failing the pick.
 * Returns an empty array if nothing was picked.
 */
export async function pickChatImages(maxCount: number): Promise<PickedChatImage[]> {
  if (maxCount <= 0) return [];
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photo library to attach images."
      );
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      ...(maxCount > 1
        ? { allowsMultipleSelection: true, selectionLimit: maxCount, orderedSelection: true }
        : {}),
    });

    if (result.canceled || !result.assets?.length) return [];

    // selectionLimit isn't enforced by every Android picker; trim defensively.
    const assets = result.assets.filter((a) => Boolean(a.uri)).slice(0, maxCount);
    return await mapWithConcurrency(assets, COMPRESSION_CONCURRENCY, toPickedChatImage);
  } catch (error) {
    logger.error("Error picking chat image", error as Error);
    Alert.alert("Error", "Failed to pick image. Please try again.");
    return [];
  }
}
