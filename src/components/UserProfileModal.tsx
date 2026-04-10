import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Database } from "../types/database.types";
import { FlippableAvatar } from "../features/profile/components/FlippableAvatar";
import {
  useBanUser,
  type BanDuration,
} from "../features/profile/hooks/useBanUser";
import { useBlockUser } from "../features/posts/hooks/useBlockUser";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

const screenWidth = Dimensions.get("window").width;
const FOUNDING_FATHER_GOLD_DARK = "#FFD700";
const FOUNDING_FATHER_GOLD_LIGHT = "#B8860B";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const BAN_OPTIONS: { label: string; value: BanDuration }[] = [
  { label: "10 Days", value: "10_days" },
  { label: "1 Month", value: "1_month" },
  { label: "1 Year", value: "1_year" },
  { label: "Permanent", value: "permanent" },
];

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  currentUserId?: string | null;
  isAdmin?: boolean;
}

export default function UserProfileModal({
  visible,
  onClose,
  userId,
  currentUserId,
  isAdmin = false,
}: UserProfileModalProps) {
  const { theme, isDark } = useTheme();
  const foundingFatherColor = isDark
    ? FOUNDING_FATHER_GOLD_DARK
    : FOUNDING_FATHER_GOLD_LIGHT;
  const [showBanDuration, setShowBanDuration] = useState(false);
  const banUserMutation = useBanUser();
  const blockUserMutation = useBlockUser(currentUserId ?? null);
  const canBan = isAdmin && Boolean(currentUserId) && currentUserId !== userId;
  const canBlock = Boolean(currentUserId) && currentUserId !== userId;

  const handleBlockUser = () => {
    Alert.alert(
      "Block User",
      "You will no longer see public posts or receive messages from this user.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            blockUserMutation.mutate(
              { targetUserId: userId, scope: "profile_only" },
              { onSuccess: onClose },
            );
          },
        },
      ],
    );
  };

  // Fetch user profile
  const { data: profile, isLoading: isLoadingProfile } =
    useQuery<Profile | null>({
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
        .eq("user_id", userId)
        .or("is_banned.is.null,is_banned.eq.false");

      if (error) throw error;

      return (data || []).reduce(
        (sum: number, post: any) => sum + (post.vote_score || 0),
        0,
      );
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
                <FlippableAvatar
                  currentUser={profile ?? null}
                  onAvatarPress={() => {}}
                />
              </View>

              {/* Username */}
              <Text style={[styles.username, { color: theme.text }]}>
                @{profile?.username || "Unknown"}
              </Text>

              {/* Total Votes */}
              <View style={styles.votesContainer}>
                <MaterialCommunityIcons
                  name={totalVotes >= 0 ? "arrow-up-bold" : "arrow-down-bold"}
                  size={moderateScale(24)}
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
                  {totalVotes >= 0 ? `${totalVotes}` : `${totalVotes}`} total
                  votes
                </Text>
              </View>

              {profile?.is_founding_member === true && (
                <Text
                  style={[
                    styles.foundingFatherText,
                    { color: foundingFatherColor },
                  ]}
                >
                  Founding Member
                </Text>
              )}

              {/* Ban User (admin only) */}
              {canBan ? (
                <Pressable
                  style={[
                    styles.banButton,
                    { borderColor: theme.error ?? "#EF4444" },
                  ]}
                  onPress={() => setShowBanDuration(true)}
                  disabled={banUserMutation.isPending}
                >
                  <MaterialCommunityIcons
                    name="account-cancel"
                    size={moderateScale(20)}
                    color={theme.error ?? "#EF4444"}
                  />
                  <Text
                    style={[
                      styles.banButtonText,
                      { color: theme.error ?? "#EF4444" },
                    ]}
                  >
                    Ban User
                  </Text>
                </Pressable>
              ) : null}

              {/* Block User */}
              {canBlock ? (
                <Pressable
                  style={[
                    styles.blockButton,
                    { borderColor: theme.secondaryText ?? "#9CA3AF" },
                  ]}
                  onPress={handleBlockUser}
                  disabled={blockUserMutation.isPending}
                >
                  <MaterialCommunityIcons
                    name="block-helper"
                    size={moderateScale(20)}
                    color={theme.secondaryText ?? "#9CA3AF"}
                  />
                  <Text
                    style={[
                      styles.blockButtonText,
                      { color: theme.secondaryText ?? "#9CA3AF" },
                    ]}
                  >
                    Block User
                  </Text>
                </Pressable>
              ) : null}

              {/* Close Button */}
              <Pressable
                style={[styles.closeButton, { backgroundColor: theme.border }]}
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

      {/* Ban duration modal */}
      <Modal
        visible={showBanDuration}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBanDuration(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowBanDuration(false)}
        >
          <Pressable
            style={[styles.banModalContent, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.banModalTitle, { color: theme.text }]}>
              Ban duration
            </Text>
            {BAN_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.banOption,
                  { backgroundColor: theme.background },
                ]}
                onPress={() => {
                  setShowBanDuration(false);
                  Alert.alert(
                    "Ban User",
                    `Ban @${profile?.username ?? "user"} for ${opt.label}?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Ban",
                        style: "destructive",
                        onPress: () => {
                          banUserMutation.mutate(
                            { userId, duration: opt.value },
                            {
                              onSuccess: () => {
                                Alert.alert("Done", "User has been banned.");
                                onClose();
                              },
                            },
                          );
                        },
                      },
                    ],
                  );
                }}
                disabled={banUserMutation.isPending}
              >
                <Text style={[styles.banOptionText, { color: theme.text }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.closeButton, { backgroundColor: theme.border }]}
              onPress={() => setShowBanDuration(false)}
            >
              <Text style={[styles.closeButtonText, { color: theme.text }]}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    maxWidth: scale(400),
    borderRadius: moderateScale(16),
    padding: moderateScale(24),
    alignItems: "center",
  },
  loadingContainer: {
    padding: moderateScale(40),
  },
  avatarContainer: {
    marginBottom: verticalScale(24),
  },
  avatarText: {
    fontSize: moderateScale(48),
    fontWeight: "600",
    textAlign: "center",
    lineHeight: moderateScale(120),
  },
  username: {
    fontSize: moderateScale(20),
    fontWeight: "600",
    marginBottom: verticalScale(16),
  },
  votesContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: verticalScale(24),
    gap: moderateScale(8),
  },
  votesText: {
    fontSize: moderateScale(18),
    fontWeight: "600",
  },
  foundingFatherText: {
    fontSize: moderateScale(16),
    fontWeight: "700",
    marginBottom: verticalScale(20),
  },
  closeButton: {
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(32),
    borderRadius: moderateScale(8),
    width: "100%",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  banButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: moderateScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(8),
    borderWidth: moderateScale(1.5),
    width: "100%",
    marginBottom: verticalScale(16),
  },
  banButtonText: {
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  blockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: moderateScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(8),
    borderWidth: moderateScale(1.5),
    width: "100%",
    marginBottom: verticalScale(16),
  },
  blockButtonText: {
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  banModalContent: {
    width: screenWidth * 0.8,
    maxWidth: scale(320),
    borderRadius: moderateScale(16),
    padding: moderateScale(20),
    alignItems: "stretch",
  },
  banModalTitle: {
    fontSize: moderateScale(18),
    fontWeight: "700",
    marginBottom: verticalScale(16),
    textAlign: "center",
  },
  banOption: {
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(16),
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(8),
  },
  banOptionText: {
    fontSize: moderateScale(16),
    fontWeight: "500",
  },
});
