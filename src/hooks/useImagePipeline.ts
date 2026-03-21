import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Alert } from "react-native";
import { IMAGE_COMPRESS_QUALITY, IMAGE_MAX_WIDTH, IMAGE_SAVE_FORMAT } from "../config/images";
import { logger } from "../utils/logger";
import { mapWithConcurrency } from "../utils/asyncConcurrency";

export type ImagePipelineOptions = {
  allowEditing?: boolean;
  aspect?: [number, number];
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
};

export function useImagePipeline(options: ImagePipelineOptions = {}) {
  const IMAGE_PROCESSING_CONCURRENCY = 2;
  const {
    allowEditing = false,
    aspect,
    allowsMultipleSelection = false,
    selectionLimit = 10,
  } = options;

  const prepareImage = async (uri: string): Promise<string> => {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: IMAGE_MAX_WIDTH } }],
      {
        compress: IMAGE_COMPRESS_QUALITY,
        format: ImageManipulator.SaveFormat[IMAGE_SAVE_FORMAT as "WEBP"],
      }
    );

    return manipResult.uri;
  };

  const pickAndPrepareImages = async (): Promise<string[]> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: allowEditing,
        ...(aspect ? { aspect } : {}),
        ...(allowsMultipleSelection
          ? {
              allowsMultipleSelection: true,
              selectionLimit,
            }
          : {}),
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return [];
      }

      const imageUris = result.assets
        .map((asset) => asset.uri)
        .filter((uri): uri is string => Boolean(uri));

      const preparedImages = await mapWithConcurrency(
        imageUris,
        IMAGE_PROCESSING_CONCURRENCY,
        (uri) => prepareImage(uri),
      );

      return preparedImages;
    } catch (err) {
      logger.error("Error processing image in pipeline", err as Error);
      Alert.alert("Error", "Failed to process image. Please try again.");
      return [];
    }
  };

  const pickAndPrepareImage = async (): Promise<string | null> => {
    const uris = await pickAndPrepareImages();
    return uris[0] ?? null;
  };

  return { pickAndPrepareImage, pickAndPrepareImages };
}

