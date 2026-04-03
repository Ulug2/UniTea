import { useRef, useState, useMemo, useEffect } from "react";
import { useLocalSearchParams, router, useNavigation } from "expo-router";
import {
  Text,
  View,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useTheme } from "../../../context/ThemeContext";
import type { Theme } from "../../../context/ThemeContext";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../lib/supabase";
import SupabaseImage from "../../../components/SupabaseImage";
import { sharePost } from "../../../utils/sharePost";
import {
  FullscreenImageModal,
  resolvePostImageUri,
} from "../../../components/FullscreenImageModal";
import type { PostsSummaryViewRow } from "../../../types/posts";
import ResponsiveImage from "../../../components/ResponsiveImage";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOST_COLOR = "#EF4444";
const LOST_BG = "#FEE2E2";
const FOUND_COLOR = "#16A34A";
const FOUND_BG = "#DCFCE7";
const TEAL = "#5DBEBC";

const SAFETY_REMINDER =
  "Please meet in public places on campus when exchanging items. " +
  "If you find an item that appears to be valuable or contains identification, " +
  "consider turning it in to campus security or the student center.";

// ─── Style factory ────────────────────────────────────────────────────────────

function buildStyles(theme: Theme, topInset: number, bottomInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },

    // Custom header
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: topInset + 10,
      paddingBottom: 14,
      paddingHorizontal: 16,
      backgroundColor: theme.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      gap: 14,
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: "Poppins_700Bold",
      color: theme.text,
      flex: 1,
    },

    // Scroll container
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: bottomInset + 24,
      gap: 12,
    },

    // Shared card surface
    card: {
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },

    // User row
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    userLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    avatarCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: TEAL,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarInitial: {
      fontSize: 20,
      color: "#fff",
      fontFamily: "Poppins_600SemiBold",
    },
    avatarImage: {
      width: 46,
      height: 46,
      borderRadius: 23,
    },
    userDetails: { gap: 1 },
    username: {
      fontSize: 15,
      color: theme.text,
      fontFamily: "Poppins_600SemiBold",
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    time: {
      fontSize: 13,
      color: theme.secondaryText,
      fontFamily: "Poppins_400Regular",
    },

    // Title
    title: {
      fontSize: 22,
      fontFamily: "Poppins_700Bold",
      color: theme.text,
      lineHeight: 30,
      marginBottom: 14,
    },

    // Meta rows (location, date)
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    metaText: {
      fontSize: 14,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
      flex: 1,
    },

    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginVertical: 14,
    },

    // Section label
    sectionLabel: {
      fontSize: 15,
      fontFamily: "Poppins_600SemiBold",
      color: theme.text,
      marginBottom: 6,
    },

    // Description
    descriptionText: {
      fontSize: 15,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
      lineHeight: 24,
    },

    // Post image
    imageContainer: {
      marginBottom: 16,
    },
    postImage: {
      width: "100%",
      aspectRatio: 4 / 3,
      borderRadius: 12,
    },
    imageGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    imageTile: {
      width: "48%",
      aspectRatio: 1,
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.background,
      justifyContent: "center",
      alignItems: "center",
    },
    imageTileImage: {
      width: "100%",
      height: "100%",
    },

    // Action row (chat + share)
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    chatButton: {
      flex: 1,
      backgroundColor: TEAL,
      borderRadius: 12,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    chatButtonText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Poppins_600SemiBold",
    },
    shareButton: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    shareButtonText: {
      fontSize: 15,
      fontFamily: "Poppins_500Medium",
      color: theme.text,
    },

    // Safety reminder card
    safetyCard: {
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    safetyTitle: {
      fontSize: 15,
      fontFamily: "Poppins_600SemiBold",
      color: theme.text,
      marginBottom: 6,
    },
    safetyText: {
      fontSize: 14,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
      lineHeight: 22,
    },

    // Loading / error
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    errorText: {
      fontSize: 15,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
    },
  });
}

function LostFoundDetailGalleryItem({
  uri,
  isLast,
  onPress,
}: {
  uri: string;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginRight: isLast ? 0 : 4,
      }}
    >
      <ResponsiveImage
        source={uri}
        bucket="post-images"
        sourceKind={uri.startsWith("http") ? "uri" : "supabasePath"}
        mode="galleryPreview"
        backgroundColor="#F3F4F6"
      />
    </Pressable>
  );
}

function LostFoundDetailSingleImage({
  uri,
  onPress,
}: {
  uri: string;
  onPress: () => void;
}) {
  return (
    <ResponsiveImage
      source={uri}
      bucket="post-images"
      sourceKind={uri.startsWith("http") ? "uri" : "supabasePath"}
      mode="single"
      style={{ width: "100%" }}
      backgroundColor="#F3F4F6"
      onPress={onPress}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retry a Supabase operation with exponential back-off. */
async function retryOp<T>(
  op: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await op();
    } catch (err: unknown) {
      lastErr = err;
      const code = (err as { code?: string })?.code;
      if (code?.startsWith("4")) throw err;
      if (i < maxRetries - 1)
        await new Promise((r) => setTimeout(r, baseDelay * 2 ** i));
    }
  }
  throw lastErr;
}

function normalizeImagePaths(
  singleImagePath: string | null | undefined,
  multiImagePaths: string[] | null | undefined,
): string[] {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(multiImagePaths) ? multiImagePaths : []),
        ...(singleImagePath ? [singleImagePath] : []),
      ]
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LostFoundPostDetailed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = typeof id === "string" ? id : id?.[0];

  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;

  const navigation = useNavigation();
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const chatInProgress = useRef(false);
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  const [isGalleryInteracting, setIsGalleryInteracting] = useState(false);

  const styles = useMemo(
    () => buildStyles(theme, insets.top, insets.bottom),
    [theme, insets.top, insets.bottom],
  );

  // Prevent iOS back/close gestures from firing while the user is swiping the
  // horizontal gallery.
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !isGalleryInteracting,
      fullScreenGestureEnabled: !isGalleryInteracting,
    });
  }, [navigation, isGalleryInteracting]);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const {
    data: post,
    isLoading,
    error,
  } = useQuery<PostsSummaryViewRow | null>({
    queryKey: ["lostfound-detail", postId],
    queryFn: async () => {
      if (!postId) return null;
      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .eq("post_id", postId)
        .maybeSingle();
      if (error) throw error;
      return data as PostsSummaryViewRow | null;
    },
    enabled: !!postId,
  });

  // ── Chat handler ─────────────────────────────────────────────────────────────
  const handleContactPress = async () => {
    if (!currentUserId || !post) return;
    if (chatInProgress.current) return;
    chatInProgress.current = true;
    setIsCreatingChat(true);

    try {
      const targetId = post.user_id;

      const existing = await retryOp(async () => {
        const { data, error } = await supabase
          .from("chats")
          .select("id")
          .or(
            `and(participant_1_id.eq.${currentUserId},participant_2_id.eq.${targetId}),` +
              `and(participant_1_id.eq.${targetId},participant_2_id.eq.${currentUserId})`,
          )
          .limit(1)
          .maybeSingle();
        if (error && error.code !== "PGRST116") throw error;
        return data;
      });

      if (existing) {
        router.push(`/chat/${existing.id}`);
        return;
      }

      const created = await retryOp(async () => {
        const { data, error } = await supabase
          .from("chats")
          .insert({
            participant_1_id: currentUserId,
            participant_2_id: targetId,
            post_id: postId,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          if (error.code === "23505") {
            const { data: dup, error: dupErr } = await supabase
              .from("chats")
              .select("id")
              .or(
                `and(participant_1_id.eq.${currentUserId},participant_2_id.eq.${targetId}),` +
                  `and(participant_1_id.eq.${targetId},participant_2_id.eq.${currentUserId})`,
              )
              .limit(1)
              .single();
            if (dupErr) throw dupErr;
            return dup;
          }
          throw error;
        }
        return data;
      });

      router.push(`/chat/${created.id}`);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      const msg =
        e.message?.includes("network") || e.message?.includes("timeout")
          ? "Network error. Please check your connection."
          : e.code === "42501"
            ? "You don't have permission to create a chat."
            : "Failed to start chat. Please try again.";
      Alert.alert("Error", msg);
    } finally {
      setIsCreatingChat(false);
      chatInProgress.current = false;
    }
  };

  // ── Render states ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Post not found.</Text>
      </View>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const isLost = post.category === "lost";
  const isAnonymous = post.is_anonymous ?? false;
  const isOwnPost = currentUserId === post.user_id;
  const displayImageUrls = normalizeImagePaths(post.image_url, post.image_urls);

  const categoryPrefix = isLost ? "Lost" : "Found";
  const title = post.title
    ? `${categoryPrefix}: ${post.title}`
    : categoryPrefix;
  const description = post.content;

  const displayName = isAnonymous
    ? currentUserId === post.user_id
      ? "You (Anonymous)"
      : "Anonymous"
    : post.username;

  const initial = displayName.charAt(0).toUpperCase();

  const formattedDate = post.created_at
    ? format(new Date(post.created_at), "MMMM d, yyyy 'at' h:mm a")
    : null;

  const timeAgo = post.created_at
    ? `${formatDistanceToNowStrict(new Date(post.created_at))} ago`
    : null;

  const badgeColor = isLost ? LOST_COLOR : FOUND_COLOR;
  const badgeBg = isLost ? LOST_BG : FOUND_BG;
  const badgeLabel = isLost ? "Lost" : "Found";

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Item Details</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Main detail card ── */}
        <View style={styles.card}>
          {/* User row + category badge */}
          <View style={styles.userRow}>
            <View style={styles.userLeft}>
              {/* Avatar: image if available, initials otherwise */}
              {!isAnonymous && post.avatar_url ? (
                post.avatar_url.startsWith("http") ? (
                  <Image
                    source={{ uri: post.avatar_url }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <SupabaseImage
                    path={post.avatar_url}
                    bucket="avatars"
                    style={styles.avatarImage}
                  />
                )
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </View>
              )}

              <View style={styles.userDetails}>
                <Text style={styles.username} numberOfLines={1}>
                  {displayName}
                </Text>
                {timeAgo && (
                  <View style={styles.timeRow}>
                    <Ionicons
                      name="time-outline"
                      size={12}
                      color={theme.secondaryText}
                    />
                    <Text style={styles.time}>{timeAgo}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Category pill badge */}
            <View
              style={{
                backgroundColor: badgeBg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Poppins_600SemiBold",
                  color: badgeColor,
                }}
              >
                {badgeLabel}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Location */}
          {post.location ? (
            <View style={styles.metaRow}>
              <Ionicons
                name="location-outline"
                size={16}
                color={theme.secondaryText}
              />
              <Text style={styles.metaText}>{post.location}</Text>
            </View>
          ) : null}

          {/* Date */}
          {formattedDate ? (
            <View style={styles.metaRow}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={theme.secondaryText}
              />
              <Text style={styles.metaText}>{formattedDate}</Text>
            </View>
          ) : null}

          {/* Post image(s) — tap to expand */}
          {displayImageUrls.length > 0 ? (
            <View style={styles.imageContainer}>
              {displayImageUrls.length === 1 ? (
                <LostFoundDetailSingleImage
                  uri={displayImageUrls[0]}
                  onPress={() =>
                    setFullscreenUri(resolvePostImageUri(displayImageUrls[0]))
                  }
                />
              ) : (
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  onStartShouldSetResponderCapture={() => true}
                  // RN typings only expose the event here; returning `true` ensures
                  // the horizontal gallery captures swipe gestures exclusively.
                  onMoveShouldSetResponderCapture={() => true}
                  onResponderGrant={() => setIsGalleryInteracting(true)}
                  onResponderRelease={() => setIsGalleryInteracting(false)}
                  onTouchStart={() => setIsGalleryInteracting(true)}
                  onTouchEnd={() => setIsGalleryInteracting(false)}
                  onScrollBeginDrag={() => setIsGalleryInteracting(true)}
                  onMomentumScrollEnd={() => setIsGalleryInteracting(false)}
                  onScrollEndDrag={() => setIsGalleryInteracting(false)}
                  contentContainerStyle={{
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  {displayImageUrls.map((uri, index) => (
                    <LostFoundDetailGalleryItem
                      key={`${uri}-${index}`}
                      uri={uri}
                      isLast={index === displayImageUrls.length - 1}
                      onPress={() =>
                        setFullscreenUri(resolvePostImageUri(uri))
                      }
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          <View style={styles.divider} />

          {/* Description */}
          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.descriptionText}>{description}</Text>

          {/* Action row: Chat (others only) + Share (always) */}
          <View style={styles.actionRow}>
            {!isOwnPost && !isAnonymous && (
              <Pressable
                style={[styles.chatButton, isCreatingChat && { opacity: 0.6 }]}
                onPress={handleContactPress}
                disabled={isCreatingChat}
              >
                <MaterialCommunityIcons
                  name="message-outline"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.chatButtonText}>
                  {isCreatingChat ? "Opening chat…" : "Chat"}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={styles.shareButton}
              onPress={() => sharePost(postId, "lost_found")}
            >
              <Ionicons name="share-outline" size={20} color={theme.text} />
              <Text style={styles.shareButtonText}>Share</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Safety reminder card ── */}
        <View style={styles.safetyCard}>
          <Text style={styles.safetyTitle}>Safety Reminder</Text>
          <Text style={styles.safetyText}>{SAFETY_REMINDER}</Text>
        </View>
      </ScrollView>

      <FullscreenImageModal
        visible={Boolean(fullscreenUri)}
        uri={fullscreenUri}
        onClose={() => setFullscreenUri(null)}
      />
    </View>
  );
}
