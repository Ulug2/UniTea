import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Image, Alert } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { router } from "expo-router";
import SupabaseImage from "./SupabaseImage";

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
}: LostFoundListItemProps) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  
  // Check if this is the current user's post
  const isOwnPost = currentUserId === userId;

  const handleChatPress = async () => {
    if (!currentUserId) {
      Alert.alert("Error", "You must be logged in to start a chat");
      return;
    }

    setIsCreatingChat(true);

    try {
      // Check if chat already exists between these two users
      const { data: existingChats, error: searchError } = await supabase
        .from("chats")
        .select("*")
        .or(
          `and(participant_1_id.eq.${currentUserId},participant_2_id.eq.${userId}),and(participant_1_id.eq.${userId},participant_2_id.eq.${currentUserId})`
        );

      if (searchError) throw searchError;

      if (existingChats && existingChats.length > 0) {
        // Chat already exists, navigate to it
        router.push(`/chat/${existingChats[0].id}`);
        return;
      }

      // Create new chat
      const { data: newChat, error: createError } = await supabase
        .from("chats")
        .insert({
          participant_1_id: currentUserId,
          participant_2_id: userId,
          post_id: postId,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;

      // Navigate to new chat
      router.push(`/chat/${newChat.id}`);
    } catch (error: any) {
      console.error("Error creating/finding chat:", error);
      Alert.alert("Error", error.message || "Failed to start chat. Please try again.");
    } finally {
      setIsCreatingChat(false);
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
    chatButton: {
      backgroundColor: "#5DBEBC",
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 25,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 4,
    },
    chatButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontFamily: "Poppins_600SemiBold",
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
    <Pressable style={styles.card}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          {avatarUrl ? (
            avatarUrl.startsWith("http") ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <SupabaseImage
                path={avatarUrl}
                bucket="avatars"
                style={styles.avatarImage}
              />
            )
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitial()}</Text>
            </View>
          )}
          <Text style={styles.username}>
            {isAnonymous ? 'Anonymous' : username || "Unknown"}
          </Text>
        </View>
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
            />
          ) : (
            <SupabaseImage
              path={imageUrl}
              bucket="post-images"
              style={styles.postImage}
            />
          )}
        </View>
      )}

      {/* CHAT BUTTON - Only show if not own post */}
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
    </Pressable>
  );
});

export default LostFoundListItem;
