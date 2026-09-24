import * as ImageManipulator from "expo-image-manipulator";
import { IMAGE_COMPRESS_QUALITY, IMAGE_MAX_WIDTH, IMAGE_SAVE_FORMAT } from "../config/images";

export const COMPRESSED_IMAGE_MIME_TYPE = "image/webp";

/**
 * Resizes to IMAGE_MAX_WIDTH and re-encodes as WebP before upload — the one
 * pre-upload pipeline shared by posts, avatars, communities and chat.
 * Pass the original width to skip the resize (never upscale) when the image
 * is already narrow enough; it is still re-encoded.
 */
export async function compressImageForUpload(
  uri: string,
  originalWidth?: number | null,
): Promise<string> {
  const needsResize = !originalWidth || originalWidth > IMAGE_MAX_WIDTH;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    needsResize ? [{ resize: { width: IMAGE_MAX_WIDTH } }] : [],
    {
      compress: IMAGE_COMPRESS_QUALITY,
      format: ImageManipulator.SaveFormat[IMAGE_SAVE_FORMAT as "WEBP"],
    },
  );
  return result.uri;
}
