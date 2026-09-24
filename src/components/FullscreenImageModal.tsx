import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  View,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { AntDesign } from "@expo/vector-icons";
import { PinchToZoom } from "./PinchToZoom";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
  },
  page: {
    justifyContent: "center",
    alignItems: "center",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#fff",
    fontSize: moderateScale(15),
    marginBottom: verticalScale(12),
  },
  retryButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(18),
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  retryText: {
    color: "#fff",
    fontSize: moderateScale(15),
    fontWeight: "600",
  },
  closeButton: {
    position: "absolute",
    top: verticalScale(52),
    right: scale(20),
    width: scale(40),
    height: verticalScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  counter: {
    position: "absolute",
    top: verticalScale(60),
    alignSelf: "center",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(12),
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    zIndex: 2,
  },
  counterText: {
    color: "#fff",
    fontSize: moderateScale(13),
    fontWeight: "600",
  },
});

export type FullscreenImage = {
  /** Fully-resolved URI, or null while it is still being resolved (e.g. signing). */
  uri: string | null;
  /** Stable expo-image cache key (e.g. for signed URLs whose token changes). */
  cacheKey?: string;
};

type FullscreenImageModalProps = {
  visible: boolean;
  /** One or more images; with more than one, the viewer swipes between them. */
  images: FullscreenImage[];
  /** Page shown first. */
  initialIndex?: number;
  /** Resolving the URIs failed — pages without a URI show the error state. */
  resolveFailed?: boolean;
  /** Called on "Retry" in addition to reloading the page's image. */
  onRetry?: () => void;
  onClose: () => void;
};

type GalleryPageProps = {
  image: FullscreenImage;
  width: number;
  height: number;
  resolveFailed: boolean;
  onRetry?: () => void;
  onClose: () => void;
};

function GalleryPage({ image, width, height, resolveFailed, onRetry, onClose }: GalleryPageProps) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { uri, cacheKey } = image;

  useEffect(() => {
    setHasLoadError(false);
  }, [uri]);

  const showError = hasLoadError || (resolveFailed && uri == null);
  const handleRetry = () => {
    setHasLoadError(false);
    setAttempt((n) => n + 1);
    onRetry?.();
  };

  return (
    <Pressable style={[styles.page, { width, height }]} onPress={onClose}>
      {/* Behind the image: visible until the image draws over it, so an
          already-cached image never flashes a spinner. */}
      {!showError && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
      {showError && (
        <View style={styles.centerOverlay}>
          <Text style={styles.errorText}>Couldn't load image</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
      {uri != null && !showError && (
        // Keyed on uri + attempt so a new image or a retry always mounts a
        // fresh PinchToZoom — no leftover zoom/translate state.
        <PinchToZoom key={`${uri}#${attempt}`} style={{ width, height }}>
          <Image
            source={{ uri, cacheKey }}
            style={{ width, height }}
            contentFit="contain"
            cachePolicy="disk"
            onError={() => setHasLoadError(true)}
          />
        </PinchToZoom>
      )}
    </Pressable>
  );
}

/**
 * Full-screen image viewer shared by posts and chat: pinch-to-zoom per image,
 * horizontal swipe between images, loading spinner and error/retry state.
 * Uses expo-image so images already shown in the feed/chat are served from
 * the same disk cache.
 */
export function FullscreenImageModal({
  visible,
  images,
  initialIndex = 0,
  resolveFailed = false,
  onRetry,
  onClose,
}: FullscreenImageModalProps) {
  const { width, height } = useWindowDimensions();
  const startIndex = Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0));
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const listRef = useRef<FlatList<FullscreenImage>>(null);

  useEffect(() => {
    if (visible) setCurrentIndex(startIndex);
  }, [visible, startIndex]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {visible && images.length > 0 && (
          <FlatList
            ref={listRef}
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={startIndex}
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={handleMomentumEnd}
            keyExtractor={(image, index) => `${image.cacheKey ?? image.uri ?? "pending"}-${index}`}
            renderItem={({ item }) => (
              <GalleryPage
                image={item}
                width={width}
                height={height}
                resolveFailed={resolveFailed}
                onRetry={onRetry}
                onClose={onClose}
              />
            )}
          />
        )}

        {images.length > 1 && (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {currentIndex + 1} / {images.length}
            </Text>
          </View>
        )}

        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={moderateScale(10)}
        >
          <AntDesign name="close" size={moderateScale(20)} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * Resolves a post image value to a full https:// URI.
 * - If it already starts with "http", returned as-is.
 * - Otherwise treated as a path in the public "post-images" bucket.
 */
export function resolvePostImageUri(
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  // In the create-post flow we may already have local URIs (e.g. file://...).
  // expo-image can load these directly, so don't rewrite them to Supabase URLs.
  if (
    imageUrl.startsWith("file://") ||
    imageUrl.startsWith("content://") ||
    imageUrl.startsWith("data:")
  ) {
    return imageUrl;
  }
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/post-images/${imageUrl}`;
}
