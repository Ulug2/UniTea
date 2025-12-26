import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../types/database.types";

/**
 * Upload an image to Supabase Storage
 * @param localUri - Local file URI from device
 * @param supabase - Supabase client instance
 * @param bucket - Storage bucket name (default: "post-images")
 * @param folder - Optional folder path within bucket
 * @returns The uploaded file path
 */
export const uploadImage = async (
  localUri: string,
  supabase: SupabaseClient<Database>,
  bucket: string = "post-images",
  folder?: string
) => {
  const fileRes = await fetch(localUri); // Fetch the file from the local URI
  const arrayBuffer = await fileRes.arrayBuffer(); // Convert it into an ArrayBuffer

  const fileExt = localUri.split(".").pop()?.toLowerCase() ?? "jpeg"; // Extract the file extension
  const fileName = `${Date.now()}.${fileExt}`; // Create a unique filename using the timestamp
  const path = folder ? `${folder}/${fileName}` : fileName; // Include folder if provided

  const { error, data } = await supabase.storage
    .from(bucket) // Access the specified bucket
    .upload(path, arrayBuffer); // Upload the file

  if (error) {
    throw error; // If an error occurs, throw it
  } else {
    return data.path; // Return the uploaded file path
  }
};

/**
 * Download an image from Supabase Storage
 * @param image - Image path in storage
 * @param supabase - Supabase client instance
 * @param bucket - Storage bucket name (default: "post-images")
 * @returns Data URL string of the image
 */
export const downloadImage = async (
  image: string,
  supabase: SupabaseClient<Database>,
  bucket: string = "post-images"
) => {
  return new Promise<string>(async (resolve, reject) => {
    try {
      const { error, data } = await supabase.storage
        .from(bucket) // Access the storage bucket
        .download(image); // Download the file using its path

      if (error) {
        return reject(error); // If there's an error, reject the Promise
      }

      const fr = new FileReader(); // Create a FileReader instance
      fr.readAsDataURL(data); // Convert the fetched binary data to a Data URL
      fr.onload = () => {
        resolve(fr.result as string); // Once loaded, resolve the Promise with the Data URL
      };
      fr.onerror = () => {
        reject(new Error("Failed to read file")); // Handle FileReader errors
      };
    } catch (error) {
      reject(error); // Handle unexpected errors
    }
  });
};

/**
 * Get public URL for an image in Supabase Storage
 * @param path - Image path in storage
 * @param supabase - Supabase client instance
 * @param bucket - Storage bucket name (default: "post-images")
 * @returns Public URL string
 */
export const getImageUrl = (
  path: string,
  supabase: SupabaseClient<Database>,
  bucket: string = "post-images"
): string => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

