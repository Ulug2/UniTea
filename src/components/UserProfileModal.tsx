import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Database } from "../types/database.types";
import SupabaseImage from "./SupabaseImage";
import { DEFAULT_AVATAR } from "../constants/images";

const screenWidth = Dimensions.get("window").width;

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export default function UserProfileModal({
  visible,
  onClose,
  userId,
}: UserProfileModalProps) {
  const { theme } = useTheme();

  // Fetch user profile
  const { data: profile, isLoading: isLoadingProfile } = useQuery<Profile | null>({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: visible && Boolean(userId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30,
  });

  // Fetch user's posts to calculate total vote count (refetch when modal opens so it's up to date)
  const { data: totalVotes = 0, isLoading: isLoadingVotes } = useQuery<number>({
    queryKey: ["user-total-votes", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("posts_summary_view")
        .select("vote_score")
        .eq("user_id", userId);

      if (error) throw error;

      return (data || []).reduce((sum: number, post: any) => sum + (post.vote_score || 0), 0);
    },
    enabled: visible && Boolean(userId),
    staleTime: 0, // Always refetch when modal opens so total votes is current
    gcTime: 1000 * 60 * 15,
    refetchOnMount: "always",
  });

  const isLoading = isLoadingProfile || isLoadingVotes;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: theme.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : (
            <>
              {/* Avatar - Bigger size */}
              <View style={styles.avatarContainer}>
                {profile?.avatar_url ? (
                  profile.avatar_url.startsWith("http") ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <SupabaseImage
                      path={profile.avatar_url}
                      bucket="avatars"
                      style={styles.avatar}
                    />
                  )
                ) : (
                  <Image source={DEFAULT_AVATAR} style={styles.avatar} />
                )}
              </View>

              {/* Username */}
              <Text style={[styles.username, { color: theme.text }]}>
                @{profile?.username || "Unknown"}
              </Text>

              {/* Total Votes */}
              <View style={styles.votesContainer}>
                <MaterialCommunityIcons
                  name={totalVotes >= 0 ? "arrow-up-bold" : "arrow-down-bold"}
                  size={24}
                  color={totalVotes >= 0 ? "#51CF66" : "#FF6B6B"}
                />
                <Text
                  style={[
                    styles.votesText,
                    {
                      color: totalVotes >= 0 ? "#51CF66" : "#FF6B6B",
                    },
                  ]}
                >
                  {totalVotes >= 0 ? `${totalVotes}` : `${totalVotes}`} total votes
                </Text>
              </View>

              {/* Close Button */}
              <Pressable
                style={[
                  styles.closeButton,
                  { backgroundColor: theme.border },
                ]}
                onPress={onClose}
              >
                <Text style={[styles.closeButtonText, { color: theme.text }]}>
                  Close
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: screenWidth * 0.85,
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  loadingContainer: {
    padding: 40,
  },
  avatarContainer: {
    marginBottom: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 120,
  },
  username: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  votesContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  votesText: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
