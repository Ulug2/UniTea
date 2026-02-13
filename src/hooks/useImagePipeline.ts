import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Alert } from "react-native";
import { IMAGE_COMPRESS_QUALITY, IMAGE_MAX_WIDTH, IMAGE_SAVE_FORMAT } from "../config/images";
import { logger } from "../utils/logger";

export type ImagePipelineOptions = {
  allowEditing?: boolean;
};

export function useImagePipeline(options: ImagePipelineOptions = {}) {
  const { allowEditing = true } = options;

  const pickAndPrepareImage = async (): Promise<string | null> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: allowEditing,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return null;
      }

      const manipResult = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: IMAGE_MAX_WIDTH } }],
        {
          compress: IMAGE_COMPRESS_QUALITY,
          format: ImageManipulator.SaveFormat[IMAGE_SAVE_FORMAT as "WEBP"],
        }
      );

      return manipResult.uri;
    } catch (err) {
      logger.error("Error processing image in pipeline", err as Error);
      Alert.alert("Error", "Failed to process image. Please try again.");
      return null;
    }
  };

  return { pickAndPrepareImage };
}

