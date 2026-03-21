import React, { useState, useEffect } from "react";
import {
  Image,
  NativeSyntheticEvent,
  Pressable,
  Text,
  TextLayoutEventData,
  View,
  StyleSheet,
  ScrollView,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNowStrict } from "date-fns";
import { Link, router } from "expo-router";
import { AntDesign } from "@expo/vector-icons";
import nuLogo from "../../assets/images/nu-logo.png";
import { DEFAULT_AVATAR } from "../constants/images";
import { useTheme } from "../context/ThemeContext";
import { useVote } from "../hooks/useVote";
import SupabaseImage from "./SupabaseImage";
import { resolvePostImageUri } from "./FullscreenImageModal";
import Poll from "./Poll";
import UserProfileModal from "./UserProfileModal";
import { useAuth } from "../context/AuthContext";
import { sharePost } from "../utils/sharePost";
import type { Theme } from "../context/ThemeContext";
import { useImageAspectRatio } from "../hooks/useImageAspectRatio";

// Shared style cache — all PostListItem instances with the same theme object reuse one StyleSheet.
// This eliminates calling StyleSheet.create N times when the feed has N visible items.
const _styleCache = new WeakMap<Theme, ReturnType<typeof _buildStyles>>();
function _buildStyles(theme: Theme) {
  return StyleSheet.create({
    link: { textDecorationLine: "none" },
    card: {
      paddingHorizontal: 15,
      paddingVertical: 12,
      backgroundColor: theme.card,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
      gap: 1,
    },
    repostHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    repostText: {
      fontSize: 13,
      color: theme.secondaryText,
      fontFamily: "Poppins_400Regular",
    },
    repostComment: {
      fontSize: 15,
      color: theme.text,
      fontFamily: "Poppins_400Regular",
      marginTop: 8,
      marginBottom: 10,
    },
    originalPostCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.background,
      marginTop: 8,
    },
    originalAuthor: {
      fontSize: 14,
      color: theme.text,
      fontFamily: "Poppins_500Medium",
      marginBottom: 6,
    },
    originalContent: {
      fontSize: 15,
      color: theme.text,
      fontFamily: "Poppins_400Regular",
      marginBottom: 6,
    },
    originalDate: { fontSize: 12, color: theme.secondaryText, marginTop: 8 },
    header: { flexDirection: "row", alignItems: "center" },
    userInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
    avatar: {
      width: 35,
      height: 35,
      borderRadius: 20,
      backgroundColor: theme.border,
    },
    username: {
      fontSize: 15,
      color: theme.text,
      fontFamily: "Poppins_500Medium",
    },
    time: { fontSize: 12, color: theme.secondaryText, marginLeft: 10 },
    // Keep feed post image height consistent regardless of image aspect ratio.
    postImage: {
      width: "100%",
      borderRadius: 10,
      marginTop: 14,
      marginBottom: 6,
      overflow: "hidden",
    },
    contentText: {
      fontSize: 16,
      marginTop: 6,
      fontFamily: "Poppins_400Regular",
      color: theme.text,
    },
    footer: { flexDirection: "row", marginTop: 10, alignItems: "center" },
    footerLeft: { flexDirection: "row", gap: 16 },
    footerRight: {
      marginLeft: "auto",
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
    },
    iconBox: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 0.5,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.background,
      marginLeft: -5,
      minHeight: 40,
      minWidth: 40,
    },
    iconText: {
      fontWeight: "500",
      marginLeft: 5,
      fontFamily: "Poppins_400Regular",
      color: theme.text,
    },
    divider: {
      width: 1,
      backgroundColor: theme.border,
      height: 14,
      marginHorizontal: 7,
      alignSelf: "center",
    },
  });
}
function getStyles(theme: Theme) {
  if (!_styleCache.has(theme)) _styleCache.set(theme, _buildStyles(theme));
  return _styleCache.get(theme)!;
}

type PostListItemProps = {
  // Post data from view
  postId: string;
  userId: string;
  content: string;
  imageUrl: string | null;
  imageUrls?: string[] | null;
  category: string | null;
  location: string | null;
  postType?: string;
  isAnonymous: boolean | null;
  isEdited: boolean | null;
  createdAt: string | null;
  updatedAt?: string | null;
  editedAt?: string | null;
  viewCount?: number | null;

  // User data from view
  username: string;
  avatarUrl: string | null;
  isVerified: boolean | null;

  // Aggregated data from view
  commentCount: number;
  voteScore: number;

  // Repost data from view
  repostCount?: number;
  repostedFromPostId?: string | null;
  repostComment?: string | null;
  originalContent?: string | null;
  originalImageUrl?: string | null;
  originalImageUrls?: string[] | null;
  originalUserId?: string | null;
  originalAuthorUsername?: string | null;
  originalAuthorAvatar?: string | null;
  originalIsAnonymous?: boolean | null;
  originalCreatedAt?: string | null;

  // Optional props for detailed post view
  isDetailedPost?: boolean;
  disableCommentInteraction?: boolean;
  isBookmarked?: boolean;
  onBookmarkPress?: () => void;
  /** Called when all images/avatars in this post have finished loading (for feed skeleton) */
  onImageLoad?: () => void;
  /** Called when any post image is tapped — parent screen manages the fullscreen modal. */
  onImagePress?: (uri: string) => void;
  /**
   * Pass from the parent list so this component doesn't need its own useMyProfile subscription.
   * Defaults to false when not provided (e.g. single-item detail views).
   */
  isAdmin?: boolean;
};

function normalizeImagePaths(
  singleImagePath: string | null | undefined,
  multiImagePaths: string[] | null | undefined,
): string[] {
  const deduped = Array.from(
    new Set(
      [
        ...(Array.isArray(multiImagePaths) ? multiImagePaths : []),
        ...(singleImagePath ? [singleImagePath] : []),
      ]
        .map((path) => String(path ?? "").trim())
        .filter((path) => path.length > 0),
    ),
  );

  return deduped;
}

type HorizontalGalleryProps = {
  imagePaths: string[];
  onImagePress?: (uri: string) => void;
  onLoadImage?: () => void;
  height?: number;
  topMargin?: number;
};

function HorizontalImageGallery({
  imagePaths,
  onImagePress,
  onLoadImage,
  height = 310,
  topMargin = 14,
}: HorizontalGalleryProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: topMargin,
        marginBottom: 6,
      }}
    >
      {imagePaths.map((path, index) => (
        <HorizontalImageGalleryItem
          key={`${path}-${index}`}
          path={path}
          height={height}
          isLast={index === imagePaths.length - 1}
          onPress={onImagePress}
          onLoadImage={onLoadImage}
        />
      ))}
    </ScrollView>
  );
}

type HorizontalGalleryItemProps = {
  path: string;
  height: number;
  isLast: boolean;
  onPress?: (uri: string) => void;
  onLoadImage?: () => void;
};

function HorizontalImageGalleryItem({
  path,
  height,
  isLast,
  onPress,
  onLoadImage,
}: HorizontalGalleryItemProps) {
  const resolvedUri = resolvePostImageUri(path);
  const ratio = useImageAspectRatio(resolvedUri);
  const width = Math.max(120, Math.min(330, height * ratio));

  const onTap = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (onPress && resolvedUri) onPress(resolvedUri);
  };

  return (
    <Pressable
      onPress={onTap}
      style={{
        width,
        height,
        marginRight: isLast ? 0 : 4,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {path.startsWith("http") ? (
        <Image
          source={{ uri: path }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onLoad={onLoadImage}
        />
      ) : (
        <SupabaseImage
          path={path}
          bucket="post-images"
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
          onLoad={onLoadImage}
        />
      )}
    </Pressable>
  );
}

// Custom comparison function for better memoization (prevents unnecessary re-renders)
const arePropsEqual = (
  prevProps: PostListItemProps,
  nextProps: PostListItemProps,
) => {
  // Compare all props that affect rendering
  return (
    prevProps.postId === nextProps.postId &&
    prevProps.userId === nextProps.userId &&
    prevProps.content === nextProps.content &&
    prevProps.imageUrl === nextProps.imageUrl &&
    JSON.stringify(prevProps.imageUrls ?? []) ===
    JSON.stringify(nextProps.imageUrls ?? []) &&
    prevProps.category === nextProps.category &&
    prevProps.location === nextProps.location &&
    prevProps.postType === nextProps.postType &&
    prevProps.isAnonymous === nextProps.isAnonymous &&
    prevProps.isEdited === nextProps.isEdited &&
    prevProps.createdAt === nextProps.createdAt &&
    prevProps.updatedAt === nextProps.updatedAt &&
    prevProps.editedAt === nextProps.editedAt &&
    prevProps.viewCount === nextProps.viewCount &&
    prevProps.username === nextProps.username &&
    prevProps.avatarUrl === nextProps.avatarUrl &&
    prevProps.isVerified === nextProps.isVerified &&
    prevProps.commentCount === nextProps.commentCount &&
    prevProps.voteScore === nextProps.voteScore &&
    prevProps.repostCount === nextProps.repostCount &&
    prevProps.repostedFromPostId === nextProps.repostedFromPostId &&
    prevProps.repostComment === nextProps.repostComment &&
    prevProps.originalContent === nextProps.originalContent &&
    prevProps.originalImageUrl === nextProps.originalImageUrl &&
    JSON.stringify(prevProps.originalImageUrls ?? []) ===
    JSON.stringify(nextProps.originalImageUrls ?? []) &&
    prevProps.originalAuthorUsername === nextProps.originalAuthorUsername &&
    prevProps.originalAuthorAvatar === nextProps.originalAuthorAvatar &&
    prevProps.originalIsAnonymous === nextProps.originalIsAnonymous &&
    prevProps.originalCreatedAt === nextProps.originalCreatedAt &&
    prevProps.isDetailedPost === nextProps.isDetailedPost &&
    prevProps.disableCommentInteraction ===
    nextProps.disableCommentInteraction &&
    prevProps.isBookmarked === nextProps.isBookmarked &&
    prevProps.onImagePress === nextProps.onImagePress &&
    prevProps.isAdmin === nextProps.isAdmin
  );
};

const PostListItem = React.memo(function PostListItem({
  postId,
  userId,
  content,
  imageUrl,
  imageUrls,
  isAnonymous,
  isEdited,
  createdAt,
  username,
  avatarUrl,
  isVerified,
  commentCount,
  voteScore,
  repostCount = 0,
  repostedFromPostId,
  repostComment,
  originalContent,
  originalImageUrl,
  originalImageUrls,
  originalUserId,
  originalAuthorUsername,
  originalAuthorAvatar,
  originalIsAnonymous,
  originalCreatedAt,
  isDetailedPost = false,
  disableCommentInteraction = false,
  isBookmarked = false,
  onBookmarkPress,
  onImageLoad,
  onImagePress,
  isAdmin = false,
}: PostListItemProps) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [repostCommentExpanded, setRepostCommentExpanded] = useState(false);
  const [originalContentExpanded, setOriginalContentExpanded] = useState(false);
  const [isContentTruncated, setIsContentTruncated] = useState(false);
  const [isRepostCommentTruncated, setIsRepostCommentTruncated] = useState(false);
  const [isOriginalContentTruncated, setIsOriginalContentTruncated] =
    useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [loadedImageCount, setLoadedImageCount] = useState(0);

  // Check if this is a repost
  const isRepost = !!repostedFromPostId;
  const displayImageUrls = normalizeImagePaths(imageUrl, imageUrls);
  const displayOriginalImageUrls = normalizeImagePaths(
    originalImageUrl,
    originalImageUrls,
  );
  const hasAvatar =
    !!(isRepost ? originalAuthorAvatar : avatarUrl) || isAnonymous;
  const hasImage = displayImageUrls.length > 0;
  const resolvedImageUri = resolvePostImageUri(displayImageUrls[0] ?? null);
  const resolvedOriginalImageUri = resolvePostImageUri(
    displayOriginalImageUrls[0] ?? null,
  );

  // Single-image layout should not be constrained by a fixed height.
  // We derive the layout height from the actual image aspect ratio.
  const postImageAspectRatio = useImageAspectRatio(
    displayImageUrls.length === 1 ? resolvedImageUri : null,
  );
  const originalImageAspectRatio = useImageAspectRatio(
    displayOriginalImageUrls.length === 1 ? resolvedOriginalImageUri : null,
  );

  useEffect(() => {
    setLoadedImageCount(0);
  }, [postId, displayImageUrls.length]);

  // Reset expansion/truncation state when list cell is reused for a different post.
  useEffect(() => {
    setContentExpanded(false);
    setRepostCommentExpanded(false);
    setOriginalContentExpanded(false);
    setIsContentTruncated(false);
    setIsRepostCommentTruncated(false);
    setIsOriginalContentTruncated(false);
  }, [postId, content, originalContent]);

  // Notify parent when all media has loaded (for feed skeleton)
  useEffect(() => {
    if (!onImageLoad) return;
    if (!hasAvatar && !hasImage) {
      onImageLoad();
      return;
    }
    if (
      (!hasAvatar || avatarLoaded) &&
      (!hasImage || loadedImageCount >= displayImageUrls.length)
    ) {
      onImageLoad();
    }
  }, [
    onImageLoad,
    hasAvatar,
    hasImage,
    avatarLoaded,
    loadedImageCount,
    displayImageUrls.length,
  ]);

  const markImageLoaded = () => {
    setLoadedImageCount((current) => current + 1);
  };

  const detectTruncation =
    (setTruncated: (truncated: boolean) => void) =>
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (isDetailedPost) return;
      const lines = event.nativeEvent.lines ?? [];
      const hasMoreThanMaxLines = lines.length > 4;
      const lastRenderedLine = lines[Math.max(0, lines.length - 1)]?.text ?? "";
      const visuallyEllipsized =
        lines.length === 4 &&
        (lastRenderedLine.endsWith("...") || lastRenderedLine.endsWith("…"));
      setTruncated(hasMoreThanMaxLines || visuallyEllipsized);
    };

  const shouldShowReadMore = (
    text: string | null | undefined,
    isTruncated: boolean,
  ) => {
    if (!text) return false;
    if (isTruncated) return true;
    const newlineCount = text.match(/\n/g)?.length ?? 0;
    return text.length > 180 || newlineCount >= 3;
  };

  // Handle profile view - only for other users, not yourself
  const handleProfilePress = (
    e: any,
    targetUserId: string,
    isAnon: boolean,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show modal for other users (not current user) and non-anonymous users
    if (!isAnon && targetUserId && targetUserId !== currentUserId) {
      setSelectedUserId(targetUserId);
      setProfileModalVisible(true);
    }
  };

  // Use voting hook for optimistic updates (still handles local state)
  const {
    userVote,
    score: postScore,
    handleUpvote,
    handleDownvote,
    isVoting,
  } = useVote({
    postId,
    initialScore: voteScore,
  });

  // Handle repost button click - navigate to create-post screen
  const handleRepostClick = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    // Navigate to create-post with repost ID
    const originalPostId = isRepost ? repostedFromPostId : postId;
    router.push(`/create-post?repostId=${originalPostId}`);
  };

  const handleShareClick = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    sharePost(postId);
  };

  const styles = getStyles(theme);

  const postCreatedAt = createdAt ? new Date(createdAt) : new Date();

  return (
    <>
      <Link href={`/post/${postId}`} asChild style={styles.link}>
        <Pressable style={styles.card}>
          {/* REPOST HEADER - intentionally removed; reposter identity shown in avatar/username row */}

          {/* HEADER */}
          <View style={styles.header}>
            <Pressable
              style={styles.userInfo}
              onPress={(e) => {
                if (!isAnonymous && userId) {
                  handleProfilePress(e, userId, false);
                }
              }}
              disabled={isAnonymous || !userId || userId === currentUserId}
            >
              {isRepost ? (
                // Show reposter's identity
                isAnonymous ? (
                  <Image
                    source={nuLogo}
                    style={styles.avatar}
                    onLoad={() => setAvatarLoaded(true)}
                  />
                ) : avatarUrl ? (
                  avatarUrl.startsWith("http") ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={styles.avatar}
                      onLoad={() => setAvatarLoaded(true)}
                    />
                  ) : (
                    <SupabaseImage
                      path={avatarUrl}
                      bucket="avatars"
                      style={styles.avatar}
                      onLoad={() => setAvatarLoaded(true)}
                    />
                  )
                ) : (
                  <Image
                    source={DEFAULT_AVATAR}
                    style={styles.avatar}
                    onLoad={() => setAvatarLoaded(true)}
                  />
                )
              ) : // Show regular post author
                isAnonymous ? (
                  <Image
                    source={nuLogo}
                    style={styles.avatar}
                    onLoad={() => setAvatarLoaded(true)}
                  />
                ) : avatarUrl ? (
                  avatarUrl.startsWith("http") ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={styles.avatar}
                      onLoad={() => setAvatarLoaded(true)}
                    />
                  ) : (
                    <SupabaseImage
                      path={avatarUrl}
                      bucket="avatars"
                      style={styles.avatar}
                      onLoad={() => setAvatarLoaded(true)}
                    />
                  )
                ) : (
                  <Image
                    source={DEFAULT_AVATAR}
                    style={styles.avatar}
                    onLoad={() => setAvatarLoaded(true)}
                  />
                )}
              <Text style={styles.username}>
                {isAnonymous
                  ? userId === currentUserId
                    ? "You"
                    : "Anonymous"
                  : username}
              </Text>
            </Pressable>
            <Text style={styles.time}>
              <AntDesign
                name="clock-circle"
                size={12}
                color={theme.secondaryText}
              />
              <Text> {formatDistanceToNowStrict(postCreatedAt)}</Text>
            </Text>
          </View>

          {/* REPOST USER'S CONTENT (if user added text when reposting) */}
          {isRepost && content && (
            <View>
              <Text
                numberOfLines={isDetailedPost || repostCommentExpanded ? undefined : 4}
                onTextLayout={detectTruncation(setIsRepostCommentTruncated)}
                style={styles.repostComment}
              >
                {content}
              </Text>
              {!isDetailedPost &&
                shouldShowReadMore(content, isRepostCommentTruncated) && (
                <Pressable
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRepostCommentExpanded((prev) => !prev);
                  }}
                  style={{ marginTop: 4 }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: "Poppins_500Medium",
                      color: theme.primary,
                    }}
                  >
                    {repostCommentExpanded ? "show less" : "... read more"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* REPOST IMAGE (if user added image when reposting) */}
          {isRepost &&
            displayImageUrls.length > 0 &&
            (displayImageUrls.length === 1 ? (
              onImagePress ? (
                <Pressable
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (resolvedImageUri) onImagePress(resolvedImageUri);
                  }}
                >
                  <SupabaseImage
                    path={displayImageUrls[0]}
                    bucket="post-images"
                    style={[
                      styles.postImage,
                      { aspectRatio: postImageAspectRatio },
                    ]}
                    onLoad={markImageLoaded}
                  />
                </Pressable>
              ) : (
                <SupabaseImage
                  path={displayImageUrls[0]}
                  bucket="post-images"
                  style={[
                    styles.postImage,
                    { aspectRatio: postImageAspectRatio },
                  ]}
                  onLoad={markImageLoaded}
                />
              )
            ) : (
              <HorizontalImageGallery
                imagePaths={displayImageUrls}
                onImagePress={onImagePress}
                onLoadImage={markImageLoaded}
                height={310}
              />
            ))}

          {/* CONTENT */}
          <View style={{ marginTop: 1 }}>
            {isRepost ? (
              // Show original post content in a card — tap to navigate to original post
              <Pressable
                style={styles.originalPostCard}
                onPress={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (repostedFromPostId) {
                    router.push(`/post/${repostedFromPostId}`);
                  }
                }}
              >
                <Text
                  numberOfLines={
                    isDetailedPost || originalContentExpanded ? undefined : 4
                  }
                  onTextLayout={detectTruncation(setIsOriginalContentTruncated)}
                  style={[styles.originalContent, { color: theme.text }]}
                >
                  {originalContent}
                </Text>
                {originalContent &&
                  !isDetailedPost &&
                  shouldShowReadMore(
                    originalContent,
                    isOriginalContentTruncated,
                  ) && (
                    <Pressable
                      onPress={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOriginalContentExpanded((prev) => !prev);
                      }}
                      style={{ marginTop: 4 }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_500Medium",
                          color: theme.primary,
                        }}
                      >
                        {originalContentExpanded
                          ? "show less"
                          : "... read more"}
                      </Text>
                    </Pressable>
                  )}
                {/* Original post image (when present in the reposted post) */}
                {displayOriginalImageUrls.length > 0 &&
                  (displayOriginalImageUrls.length === 1 ? (
                    onImagePress ? (
                      <Pressable
                        onPress={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (resolvedOriginalImageUri)
                            onImagePress(resolvedOriginalImageUri);
                        }}
                      >
                        <SupabaseImage
                          path={displayOriginalImageUrls[0]}
                          bucket="post-images"
                          style={[
                            styles.postImage,
                            {
                              marginTop: 14,
                              aspectRatio: originalImageAspectRatio,
                            },
                          ]}
                        />
                      </Pressable>
                    ) : (
                      <SupabaseImage
                        path={displayOriginalImageUrls[0]}
                        bucket="post-images"
                        style={[
                          styles.postImage,
                          {
                            marginTop: 14,
                            aspectRatio: originalImageAspectRatio,
                          },
                        ]}
                      />
                    )
                  ) : (
                    <HorizontalImageGallery
                      imagePaths={displayOriginalImageUrls}
                      onImagePress={onImagePress}
                      height={310}
                      topMargin={14}
                    />
                  ))}
                {/* Original post poll (Poll renders null if the post has no poll) */}
                {repostedFromPostId && <Poll postId={repostedFromPostId} />}
                {originalCreatedAt && (
                  <Text style={styles.originalDate}>
                    Original post:{" "}
                    {formatDistanceToNowStrict(new Date(originalCreatedAt))} ago
                  </Text>
                )}
              </Pressable>
            ) : (
              // Regular post content
              <>
                {displayImageUrls.length > 0 &&
                  (displayImageUrls.length === 1 ? (
                    onImagePress ? (
                      <Pressable
                        onPress={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (resolvedImageUri) onImagePress(resolvedImageUri);
                        }}
                      >
                        <SupabaseImage
                          path={displayImageUrls[0]}
                          bucket="post-images"
                          style={[
                            styles.postImage,
                            { aspectRatio: postImageAspectRatio },
                          ]}
                          onLoad={markImageLoaded}
                        />
                      </Pressable>
                    ) : (
                      <SupabaseImage
                        path={displayImageUrls[0]}
                        bucket="post-images"
                        style={[
                          styles.postImage,
                          { aspectRatio: postImageAspectRatio },
                        ]}
                        onLoad={markImageLoaded}
                      />
                    )
                  ) : (
                    <HorizontalImageGallery
                      imagePaths={displayImageUrls}
                      onImagePress={onImagePress}
                      onLoadImage={markImageLoaded}
                      height={310}
                    />
                  ))}
                {content && (
                  <View>
                    <Text
                      numberOfLines={
                        isDetailedPost || contentExpanded ? undefined : 4
                      }
                      onTextLayout={detectTruncation(setIsContentTruncated)}
                      style={[styles.contentText, { color: theme.text }]}
                    >
                      {content}
                    </Text>
                    {!isDetailedPost &&
                      shouldShowReadMore(content, isContentTruncated) && (
                        <Pressable
                          onPress={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContentExpanded((prev) => !prev);
                          }}
                          style={{ marginTop: 4 }}
                        >
                          <Text
                            style={{
                              fontSize: 15,
                              fontFamily: "Poppins_500Medium",
                              color: theme.primary,
                            }}
                          >
                            {contentExpanded ? "show less" : "... read more"}
                          </Text>
                        </Pressable>
                      )}
                  </View>
                )}
                {/* POLL (only for original feed posts, not repost wrappers) */}
                {!isRepost && <Poll postId={postId} />}
              </>
            )}
          </View>

          {/* FOOTER */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <View style={styles.iconBox}>
                <Pressable
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleUpvote();
                  }}
                  disabled={isVoting}
                >
                  <MaterialCommunityIcons
                    name={
                      userVote === "upvote"
                        ? "arrow-up-bold"
                        : "arrow-up-bold-outline"
                    }
                    size={22}
                    color={userVote === "upvote" ? theme.primary : theme.text}
                  />
                </Pressable>
                <Text style={styles.iconText}>{postScore}</Text>
                <View style={styles.divider} />
                <Pressable
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDownvote();
                  }}
                  disabled={isVoting}
                >
                  <MaterialCommunityIcons
                    name={
                      userVote === "downvote"
                        ? "arrow-down-bold"
                        : "arrow-down-bold-outline"
                    }
                    size={22}
                    color={userVote === "downvote" ? theme.primary : theme.text}
                  />
                </Pressable>
              </View>
              <Pressable
                onPress={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Navigate to post detail (comment button behavior)
                  if (!disableCommentInteraction && !isDetailedPost) {
                    router.push(`/post/${postId}`);
                  }
                }}
                style={styles.iconBox}
                disabled={disableCommentInteraction || isDetailedPost}
              >
                <MaterialCommunityIcons
                  name="comment-outline"
                  size={22}
                  color={theme.text}
                />
                <Text style={styles.iconText}>{commentCount || 0}</Text>
              </Pressable>
              <Pressable
                onPress={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRepostClick(e);
                }}
                style={styles.iconBox}
              >
                <Ionicons name="repeat-outline" size={22} color={theme.text} />
                <Text style={styles.iconText}>{repostCount}</Text>
              </Pressable>
              <Pressable
                onPress={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleShareClick(e);
                }}
                style={styles.iconBox}
              >
                <Ionicons name="share-outline" size={22} color={theme.text} />
              </Pressable>
              {isDetailedPost && onBookmarkPress && (
                <Pressable
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onBookmarkPress();
                  }}
                  style={styles.iconBox}
                >
                  <MaterialCommunityIcons
                    name={isBookmarked ? "bookmark" : "bookmark-outline"}
                    size={22}
                    color={theme.text}
                  />
                </Pressable>
              )}
            </View>
          </View>
        </Pressable>
      </Link>

      {/* User Profile Modal */}
      {selectedUserId && (
        <UserProfileModal
          visible={profileModalVisible}
          onClose={() => {
            setProfileModalVisible(false);
            setSelectedUserId(null);
          }}
          userId={selectedUserId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}, arePropsEqual);

export default PostListItem;
