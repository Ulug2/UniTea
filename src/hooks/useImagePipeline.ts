import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { compressImageForUpload } from "../utils/imageCompression";
import { logger } from "../utils/logger";
import { mapWithConcurrency } from "../utils/asyncConcurrency";

export type PreparedImage = {
  uri: string;
  aspectRatio: number;
};

export type ImagePipelineOptions = {
  allowEditing?: boolean;
  aspect?: [number, number];
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
};

const DEFAULT_ASPECT_RATIO = 4 / 3;

export function useImagePipeline(options: ImagePipelineOptions = {}) {
  const IMAGE_PROCESSING_CONCURRENCY = 2;
  const {
    allowEditing = false,
    aspect,
    allowsMultipleSelection = false,
    selectionLimit = 10,
  } = options;

  const pickAndPrepareImages = async (): Promise<PreparedImage[]> => {
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

      const validAssets = result.assets.filter((a) => Boolean(a.uri));

      return await mapWithConcurrency(
        validAssets,
        IMAGE_PROCESSING_CONCURRENCY,
        async (asset) => {
          const preparedUri = await compressImageForUpload(asset.uri);
          const aspectRatio =
            asset.width && asset.height && asset.height > 0
              ? asset.width / asset.height
              : DEFAULT_ASPECT_RATIO;
          return { uri: preparedUri, aspectRatio };
        },
      );
    } catch (err) {
      logger.error("Error processing image in pipeline", err as Error);
      Alert.alert("Error", "Failed to process image. Please try again.");
      return [];
    }
  };

  const pickAndPrepareImage = async (): Promise<PreparedImage | null> => {
    const results = await pickAndPrepareImages();
    return results[0] ?? null;
  };

  return { pickAndPrepareImage, pickAndPrepareImages };
}

