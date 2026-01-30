import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../types/database.types";
import * as FileSystem from 'expo-file-system/legacy';

// Configuration
const MAX_FILE_SIZE_MB = 10; // 10MB limit
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/**
 * Retry helper for upload operations
 */
const retryUpload = async <T>(
    operation: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    delay: number = 1000
): Promise<T> => {
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // Don't retry on client errors (400-499) or quota errors
            if (error?.statusCode >= 400 && error?.statusCode < 500) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }

    throw lastError;
};

/**
 * Validate image file
 */
const validateImage = async (localUri: string): Promise<void> => {
    // Check file extension
    const fileExt = localUri.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        throw new Error(`Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }

    // Check file size
    try {
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists && fileInfo.size) {
            if (fileInfo.size > MAX_FILE_SIZE_BYTES) {
                throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB`);
            }
        }
    } catch (error: any) {
        // If we can't get file info, continue but log warning
        console.warn('[validateImage] Could not get file info:', error);
    }
};

/**
 * Upload with timeout
 */
const uploadWithTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number = UPLOAD_TIMEOUT_MS
): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Upload timeout')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
};

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
): Promise<string> => {
    try {
        // Validate image before upload
        await validateImage(localUri);

        const fileExt = localUri.split(".").pop()?.toLowerCase() ?? "jpeg";
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const path = folder ? `${folder}/${fileName}` : fileName;

        // Fetch file with retry and timeout
        const uploadOperation = async () => {
            const fileRes = await fetch(localUri);

            if (!fileRes.ok) {
                throw new Error(`Failed to fetch file: ${fileRes.statusText}`);
            }

            const arrayBuffer = await fileRes.arrayBuffer();

            // Double-check size after fetch (in case FileSystem check failed)
            if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
                throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB`);
            }

            const { error, data } = await supabase.storage
                .from(bucket)
                .upload(path, arrayBuffer, {
                    contentType: `image/${fileExt}`,
                    cacheControl: '3600',
                    upsert: false, // Prevent overwriting existing files
                });

            if (error) {
                throw error;
            }

            return data.path;
        };

        // Execute upload with retry and timeout
        return await uploadWithTimeout(retryUpload(uploadOperation), UPLOAD_TIMEOUT_MS);
    } catch (error: any) {
        console.error('[uploadImage] Upload failed:', error);

        const msg = error?.message ?? '';
        const isBucketNotFound = msg.includes('Bucket not found') || msg.includes('StorageApiError');
        const isRlsViolation = msg.includes('row-level security') || msg.includes('violates row-level security');

        // Provide user-friendly error messages
        if (isBucketNotFound) {
            throw new Error(
                `Storage bucket "${bucket}" does not exist. Create it in Supabase Dashboard → Storage → New bucket. See sql/STORAGE_BUCKETS_SETUP.md.`
            );
        }
        if (isRlsViolation) {
            throw new Error(
                `Upload denied by storage policy. Add RLS policies for bucket "${bucket}". Run sql/storage_rls_policies.sql in Supabase SQL Editor.`
            );
        }
        if (msg.includes('timeout')) {
            throw new Error('Upload timed out. Please check your connection and try again.');
        }
        if (msg.includes('too large')) {
            throw error; // Already user-friendly
        }
        if (msg.includes('Invalid file type')) {
            throw error; // Already user-friendly
        }
        if (error.statusCode === 413) {
            throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB`);
        }
        if (error.statusCode === 429) {
            throw new Error('Too many uploads. Please wait a moment and try again.');
        }
        throw new Error('Failed to upload image. Please try again.');
    }
};

/**
 * Download an image from Supabase Storage with retry logic
 * @param image - Image path in storage
 * @param supabase - Supabase client instance
 * @param bucket - Storage bucket name (default: "post-images")
 * @returns Data URL string of the image
 */
export const downloadImage = async (
    image: string,
    supabase: SupabaseClient<Database>,
    bucket: string = "post-images"
): Promise<string> => {
    return new Promise<string>(async (resolve, reject) => {
        try {
            const downloadOperation = async () => {
                const { error, data } = await supabase.storage
                    .from(bucket)
                    .download(image);

                if (error) {
                    throw error;
                }

                return data;
            };

            // Download with retry and timeout
            const data = await uploadWithTimeout(
                retryUpload(downloadOperation),
                UPLOAD_TIMEOUT_MS
            );

            const fr = new FileReader();
            fr.readAsDataURL(data);

            fr.onload = () => {
                resolve(fr.result as string);
            };

            fr.onerror = () => {
                reject(new Error("Failed to read file"));
            };
        } catch (error: any) {
            console.error('[downloadImage] Download failed:', error);

            if (error.message?.includes('timeout')) {
                reject(new Error('Download timed out. Please check your connection.'));
            } else {
                reject(new Error('Failed to download image. Please try again.'));
            }
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

