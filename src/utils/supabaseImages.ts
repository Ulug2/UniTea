import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../types/database.types";
import * as FileSystem from 'expo-file-system/legacy';

// Configuration
const MAX_FILE_SIZE_MB = 10; // 10MB limit
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];

// Canonical Content-Type for each allowed extension — the single source of
// truth for what gets sent to Supabase Storage, keyed off the same
// resolution result used for validation and filename generation.
const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
};

// Maps a picker-reported MIME type to the extension we treat it as. Some
// pickers/providers report `image/jpg` (non-standard) instead of the
// correct `image/jpeg` — both are accepted here and normalized to `jpeg`.
const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
};

type ResolvedImageType = { extension: string; contentType: string };

/**
 * Extracts a lowercased extension from a URI or filename, ignoring any
 * query string/fragment (`...jpg?token=...`) and returning "" when there's
 * no `.` to split on at all (e.g. an extension-less `content://` URI).
 */
function extensionFromPath(path: string): string {
    const withoutQueryOrFragment = path.split(/[?#]/)[0];
    const segments = withoutQueryOrFragment.split('.');
    if (segments.length < 2) return '';
    return segments.pop()!.toLowerCase();
}

/**
 * Single source of truth for "what image type is this?" — used for
 * validation, the generated storage filename, and the Content-Type sent to
 * Supabase Storage, so all three always agree.
 *
 * Resolution order (most to least reliable):
 *  1. `mimeType` — OS-resolved actual content type from the picker; immune
 *     to filename/URI quirks.
 *  2. `fileName`'s extension — OS-reported preferred filename.
 *  3. `localUri`'s extension — fallback only. Unreliable on its own: Android
 *     commonly returns extension-less `content://` URIs, and this is kept
 *     purely for callers that don't have picker metadata available (every
 *     upload path already re-encodes through expo-image-manipulator before
 *     reaching here, which always produces a real, predictable extension).
 */
function resolveImageType(
    localUri: string,
    mimeType?: string | null,
    fileName?: string | null,
): ResolvedImageType | null {
    if (mimeType) {
        const ext = MIME_TYPE_TO_EXTENSION[mimeType.toLowerCase()];
        if (ext) return { extension: ext, contentType: EXTENSION_TO_CONTENT_TYPE[ext] };
    }

    if (fileName) {
        const ext = extensionFromPath(fileName);
        if (ALLOWED_EXTENSIONS.includes(ext)) {
            return { extension: ext, contentType: EXTENSION_TO_CONTENT_TYPE[ext] };
        }
    }

    const uriExt = extensionFromPath(localUri);
    if (ALLOWED_EXTENSIONS.includes(uriExt)) {
        return { extension: uriExt, contentType: EXTENSION_TO_CONTENT_TYPE[uriExt] };
    }

    return null;
}

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
 * Validate image file. `resolved` is computed once by the caller (via
 * resolveImageType) and reused here rather than re-parsed, so validation and
 * the actual upload can never disagree on what type the file is.
 */
const validateImage = async (
    localUri: string,
    resolved: ResolvedImageType | null,
): Promise<void> => {
    if (!resolved) {
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

export type UploadImageOptions = {
    /**
     * Caller-supplied deterministic key to upload to (e.g.
     * `{userId}/{postId}/{index}` or `{chatId}/{clientMessageId}`),
     * instead of the default random Date.now()-based filename. The
     * resolved file extension is still appended by uploadImage() itself —
     * the caller only owns the identifying part of the path, not the file
     * type. uploadImage() has no knowledge of what this key means (post,
     * chat, user, message, etc.) — that's entirely the caller's concern.
     * `folder` is ignored when this is set (the caller's key already
     * encodes everything needed).
     */
    path?: string;
    /**
     * Only meaningful together with `path`. When true, an upload to a
     * path that already has an object overwrites it in place instead of
     * failing — the point of a deterministic path is that a retry of the
     * same logical attempt lands on the exact same key. Defaults to
     * false. Ignored (always false) for random-filename uploads, since a
     * random filename never legitimately collides with an existing
     * object.
     */
    upsert?: boolean;
};

/**
 * Upload an image to Supabase Storage
 * @param localUri - Local file URI from device
 * @param supabase - Supabase client instance
 * @param bucket - Storage bucket name (default: "post-images")
 * @param folder - Optional folder path within bucket (ignored when options.path is set)
 * @param mimeType - Picker-reported MIME type, if available (most reliable type signal)
 * @param fileName - Picker-reported filename, if available (second most reliable)
 * @param options - Optional deterministic-path upload mode; omit for the default random-filename mode
 * @returns The uploaded file path
 */
export const uploadImage = async (
    localUri: string,
    supabase: SupabaseClient<Database>,
    bucket: string = "post-images",
    folder?: string,
    mimeType?: string | null,
    fileName?: string | null,
    options?: UploadImageOptions,
): Promise<string> => {
    try {
        const resolved = resolveImageType(localUri, mimeType, fileName);

        // Validate image before upload
        await validateImage(localUri, resolved);

        // resolveImageType is the sole source of truth for file type — reused
        // here for both the generated filename and the Content-Type below so
        // they can never disagree with what validation just accepted.
        const { extension: fileExt, contentType } = resolved!;
        const path = options?.path
            ? `${options.path}.${fileExt}`
            : folder
                ? `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
                : `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        // Deterministic-path uploads may opt into overwrite; random-filename
        // uploads never do (nothing to legitimately collide with).
        const upsert = options?.path ? (options.upsert ?? false) : false;

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
                    contentType,
                    cacheControl: '3600',
                    upsert,
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

