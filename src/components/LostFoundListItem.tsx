import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Image, Alert } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { formatDistanceToNowStrict } from "date-fns";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import SupabaseImage from "./SupabaseImage";
import UserProfileModal from "./UserProfileModal";
import { DEFAULT_AVATAR } from "../constants/images";
import { useMyProfile } from "../features/profile/hooks/useMyProfile";
import { sharePost } from "../utils/sharePost";

export type LostFoundPostForMenu = {
  postId: string;
  userId: string;
  username: string;
};

type LostFoundListItemProps = {
  postId: string;
  userId: string;
  content: string;
  imageUrl: string | null;
  category: string | null;
  location: string | null;
  isAnonymous: boolean | null;
  createdAt: string | null;
  username: string;
  avatarUrl: string | null;
  isVerified: boolean | null;
  onLongPress?: (post: LostFoundPostForMenu) => void;
  /** Called when avatar and post image (if any) have finished loading (for skeleton reveal) */
  onImageLoad?: () => void;
};

// Custom comparison function for better memoization (prevents unnecessary re-renders)
const arePropsEqual = (prevProps: LostFoundListItemProps, nextProps: LostFoundListItemProps) => {
  return (
    prevProps.postId === nextProps.postId &&
    prevProps.userId === nextProps.userId &&
    prevProps.content === nextProps.content &&
    prevProps.imageUrl === nextProps.imageUrl &&
    prevProps.category === nextProps.category &&
    prevProps.location === nextProps.location &&
    prevProps.isAnonymous === nextProps.isAnonymous &&
    prevProps.createdAt === nextProps.createdAt &&
    prevProps.username === nextProps.username &&
    prevProps.avatarUrl === nextProps.avatarUrl &&
    prevProps.isVerified === nextProps.isVerified &&
    prevProps.onLongPress === nextProps.onLongPress &&
    prevProps.onImageLoad === nextProps.onImageLoad
  );
};

const LostFoundListItem = React.memo(function LostFoundListItem({
  postId,
  userId,
  content,
  imageUrl,
  category,
  location,
  isAnonymous,
  createdAt,
  username,
  avatarUrl,
  onLongPress,
  onImageLoad,
}: LostFoundListItemProps) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: currentUser } = useMyProfile(currentUserId);
  const isAdmin = currentUser?.is_admin === true;
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const onImageLoadCalledRef = useRef(false);

  const hasImage = !!imageUrl;

  // Notify parent when all media has loaded (for skeleton reveal)
  useEffect(() => {
    if (!onImageLoad) return;
    if (onImageLoadCalledRef.current) return;
    const avatarReady = !avatarUrl || avatarLoaded;
    const imageReady = !hasImage || imageLoaded;
    if (avatarReady && imageReady) {
      onImageLoadCalledRef.current = true;
      onImageLoad();
    }
  }, [onImageLoad, avatarUrl, avatarLoaded, hasImage, imageLoaded]);

  // No avatar URL means we show DEFAULT_AVATAR (local) – consider loaded
  useEffect(() => {
    if (!avatarUrl) setAvatarLoaded(true);
  }, [avatarUrl]);

  // No post image – consider loaded
  useEffect(() => {
    if (!imageUrl) setImageLoaded(true);
  }, [imageUrl]);

  // Prevent duplicate chat creation requests
  const chatCreationInProgress = useRef(false);

  // Check if this is the current user's post
  const isOwnPost = currentUserId === userId;

  /**
   * Retry helper for database operations
   */
  const retryOperation = async <T,>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> => {
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (400-499)
        if (error?.code?.startsWith("4")) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        if (i < maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, delay * Math.pow(2, i))
          );
        }
      }
    }

    throw lastError;
  };

  const handleChatPress = async () => {
    if (!currentUserId) {
      Alert.alert("Error", "You must be logged in to start a chat");
      return;
    }

    // Prevent duplicate requests (race condition guard)
    if (chatCreationInProgress.current) {
      console.log("[handleChatPress] Chat creation already in progress");
      return;
    }

    chatCreationInProgress.current = true;
    setIsCreatingChat(true);

    try {
      // Check if chat already exists with retry logic
      const existingChat = await retryOperation(async () => {
        // Use a more reliable query pattern
        const { data, error } = await supabase
          .from("chats")
          .select("id")
          .or(
            `and(participant_1_id.eq.${currentUserId},participant_2_id.eq.${userId}),and(participant_1_id.eq.${userId},participant_2_id.eq.${currentUserId})`
          )
          .limit(1)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          // PGRST116 = no rows
          throw error;
        }

        return data;
      });

      if (existingChat) {
        // Chat already exists, navigate to it
        router.push(`/chat/${existingChat.id}`);
        return;
      }

      // Create new chat with retry logic
      const newChat = await retryOperation(async () => {
        const { data, error } = await supabase
          .from("chats")
          .insert({
            participant_1_id: currentUserId,
            participant_2_id: userId,
            post_id: postId,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          // Handle unique constraint violation (chat created by another request)
          if (error.code === "23505") {
            // Duplicate chat - fetch and return it instead
            const { data: existing, error: fetchError } = await supabase
              .from("chats")
              .select("id")
              .or(
                `and(participant_1_id.eq.${currentUserId},participant_2_id.eq.${userId}),and(participant_1_id.eq.${userId},participant_2_id.eq.${currentUserId})`
              )
              .limit(1)
              .single();

            if (fetchError) throw fetchError;
            return existing;
          }

          throw error;
        }

        return data;
      });

      // Navigate to chat
      router.push(`/chat/${newChat.id}`);
    } catch (error: any) {
      console.error("Error creating/finding chat:", error);

      // Provide user-friendly error messages
      let errorMessage = "Failed to start chat. Please try again.";

      if (
        error.message?.includes("network") ||
        error.message?.includes("timeout")
      ) {
        errorMessage = "Network error. Please check your connection.";
      } else if (error.code === "42501") {
        errorMessage = "You don't have permission to create a chat.";
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setIsCreatingChat(false);
      chatCreationInProgress.current = false;
    }
  };

  // Get the category prefix
  const categoryPrefix = category === "lost" ? "Lost" : "Found";

  const styles = StyleSheet.create({
    link: {
      textDecorationLine: "none",
    },
    card: {
      paddingHorizontal: 15,
      paddingVertical: 12,
      backgroundColor: theme.card,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
      gap: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    userInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#5DBEBC",
      justifyContent: "center",
      alignItems: "center",
    },
    avatarText: {
      fontSize: 18,
      color: "#FFFFFF",
      fontFamily: "Poppins_600SemiBold",
    },
    avatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    username: {
      fontSize: 15,
      color: theme.text,
      fontFamily: "Poppins_500Medium",
    },
    time: {
      fontSize: 13,
      color: theme.secondaryText,
      fontFamily: "Poppins_400Regular",
    },
    title: {
      fontSize: 17,
      fontFamily: "Poppins_700Bold",
      color: theme.text,
    },
    locationContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    locationText: {
      fontSize: 14,
      color: theme.secondaryText,
      fontFamily: "Poppins_400Regular",
    },
    description: {
      fontSize: 15,
      fontFamily: "Poppins_400Regular",
      color: theme.secondaryText,
      lineHeight: 22,
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "center",
      gap: 10,
      marginTop: 12,
      width: "100%",
    },
    chatButton: {
      flex: 1,
      backgroundColor: "#5DBEBC",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    chatButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontFamily: "Poppins_600SemiBold",
    },
    shareButton: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    shareButtonText: {
      fontSize: 16,
      fontFamily: "Poppins_500Medium",
    },
    imageContainer: {
      marginTop: 12,
      marginBottom: 8,
      borderRadius: 12,
      overflow: "hidden",
    },
    postImage: {
      width: "100%",
      aspectRatio: 4 / 3,
      borderRadius: 12,
    },
  });

  // Get user's first initial for avatar
  const getInitial = () => {
    if (!username) return "?";
    return username.charAt(0).toUpperCase();
  };

  return (
    <Pressable
      style={styles.card}
      onLongPress={() =>
        onLongPress?.({ postId, userId, username: username ?? "Unknown" })
      }
      delayLongPress={400}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          style={styles.userInfo}
          onPress={() => {
            if (!isAnonymous && userId && userId !== currentUserId) {
              setProfileModalVisible(true);
            }
          }}
          disabled={isAnonymous || !userId || userId === currentUserId}
        >
          {avatarUrl ? (
            avatarUrl.startsWith("http") ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                onLoad={() => setAvatarLoaded(true)}
              />
            ) : (
              <SupabaseImage
                path={avatarUrl}
                bucket="avatars"
                style={styles.avatarImage}
                onLoad={() => setAvatarLoaded(true)}
              />
            )
          ) : (
            <Image
              source={DEFAULT_AVATAR}
              style={styles.avatarImage}
              onLoad={() => setAvatarLoaded(true)}
            />
          )}
          <Text style={styles.username}>
            {isAnonymous
              ? currentUserId === userId
                ? "You"
                : "Anonymous"
              : username || "Unknown"}
          </Text>
        </Pressable>
        <Text style={styles.time}>
          {createdAt
            ? `${formatDistanceToNowStrict(new Date(createdAt))} ago`
            : "Recently"}
        </Text>
      </View>

      {/* CATEGORY AND LOCATION */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <Text style={styles.title}>{categoryPrefix}</Text>
        {location && (
          <View style={styles.locationContainer}>
            <Ionicons
              name="location-outline"
              size={14}
              color={theme.secondaryText}
            />
            <Text style={styles.locationText}>{location}</Text>
          </View>
        )}
      </View>

      {/* CONTENT */}
      <Text style={styles.description} numberOfLines={3}>
        {content}
      </Text>

      {/* IMAGE */}
      {imageUrl && (
        <View style={styles.imageContainer}>
          {imageUrl.startsWith("http") ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.postImage}
              resizeMode="cover"
              onLoad={() => setImageLoaded(true)}
            />
          ) : (
            <SupabaseImage
              path={imageUrl}
              bucket="post-images"
              style={styles.postImage}
              onLoad={() => setImageLoaded(true)}
            />
          )}
        </View>
      )}

      {/* CHAT AND SHARE BUTTONS */}
      <View style={styles.actionRow}>
        {!isOwnPost && (
          <Pressable
            style={[styles.chatButton, isCreatingChat && { opacity: 0.6 }]}
            onPress={(e) => {
              e.preventDefault();
              handleChatPress();
            }}
            disabled={isCreatingChat}
          >
            <MaterialCommunityIcons
              name="message-outline"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.chatButtonText}>
              {isCreatingChat ? "Loading..." : "Chat"}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={styles.shareButton}
          onPress={(e) => {
            e.preventDefault();
            sharePost(postId);
          }}
        >
          <Ionicons name="share-outline" size={20} color={theme.text} />
          <Text style={[styles.shareButtonText, { color: theme.text }]}>
            Share
          </Text>
        </Pressable>
      </View>

      {/* User Profile Modal */}
      {!isAnonymous && userId && userId !== currentUserId && (
        <UserProfileModal
          visible={profileModalVisible}
          onClose={() => setProfileModalVisible(false)}
          userId={userId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      )}
    </Pressable>
  );
}, arePropsEqual);

export default LostFoundListItem;
