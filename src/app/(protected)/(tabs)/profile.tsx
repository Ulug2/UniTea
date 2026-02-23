import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useState, useEffect, useCallback } from "react";
import { router, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import ManageAccountModal from "../../../components/ManageAccountModal";
import NotificationSettingsModal from "../../../components/NotificationSettingsModal";
import { ProfileHeader } from "../../../features/profile/components/ProfileHeader";
import { ProfileTabs } from "../../../features/profile/components/ProfileTabs";
import { ProfilePostsList } from "../../../features/profile/components/ProfilePostsList";
import { ProfileSettingsModal } from "../../../features/profile/components/ProfileSettingsModal";
import { AvatarPreviewModal } from "../../../features/profile/components/AvatarPreviewModal";
import { TERMS_URL, PRIVACY_URL } from "../../../constants/links";
import { openExternalLink } from "../../../utils/links";
import { useMyProfile } from "../../../features/profile/hooks/useMyProfile";
import { useMyPosts } from "../../../features/profile/hooks/useMyPosts";
import { useUnblockAll } from "../../../features/blocks/hooks/useUnblockAll";
import { useUpdateProfile } from "../../../features/profile/hooks/useUpdateProfile";
import { useUpdatePassword } from "../../../features/profile/hooks/useUpdatePassword";
import { useDeleteAccount } from "../../../features/profile/hooks/useDeleteAccount";
import { useAvatarUpload } from "../../../features/profile/hooks/useAvatarUpload";

export default function ProfileScreen() {
  const { theme, isDark, isManualDark, toggleTheme } = useTheme();
  const { session, signOut: authSignOut } = useAuth();
  const navigation = useNavigation();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [manageAccountVisible, setManageAccountVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "all" | "anonymous" | "bookmarked"
  >("all");
  const [notificationsVisible, setNotificationsVisible] = useState(false);

  const handleOpenTerms = useCallback(() => {
    openExternalLink(TERMS_URL).catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to open link. Please try again later.";
      Alert.alert("Unable to open link", message);
    });
  }, [openExternalLink]);

  const handleOpenPrivacy = useCallback(() => {
    openExternalLink(PRIVACY_URL).catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to open link. Please try again later.";
      Alert.alert("Unable to open link", message);
    });
  }, [openExternalLink]);

  // Fetch current user profile via hook
  const {
    data: currentUser,
    refetch: refetchProfile,
    isLoading: isLoadingProfile,
  } = useMyProfile(session?.user?.id);

  // Posts, bookmarks, and aggregates via hook
  const {
    filteredPosts,
    postScoresMap,
    commentCountsMap,
    totalVotes,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetchPosts,
    isRefetching,
  } = useMyPosts(session?.user?.id, activeTab);

  // Get current user data
  const userDisplayName = currentUser?.username || "User";
  const userEmail = session?.user?.email || "email@example.com";

  // Set up settings button handler
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setSettingsVisible(true)}
          style={{ paddingRight: 15 }}
        >
          <Ionicons name="settings-outline" size={22} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, theme, setSettingsVisible]);

  // (postScoresMap, commentCountsMap, totalVotes, filteredPosts are now provided by useMyPosts)

  async function signOut() {
    setSettingsVisible(false);
    setManageAccountVisible(false);
    const userId = session?.user?.id;
    // Clear push token first (best-effort)
    if (userId) {
      try {
        await supabase
          .from("notification_settings")
          .update({ push_token: null })
          .eq("user_id", userId);
      } catch {
        // non-fatal
      }
    }
    // Force-clear the session via AuthContext. This also handles the case where
    // the server-side session is already missing ("Auth session missing" error)
    // by explicitly setting session = null, which makes the protected layout
    // redirect to /(auth) without the auth layout bouncing the user back.
    await authSignOut();
  }

  // Unblock all users mutation via shared hook
  const unblockAllMutation = useUnblockAll();

  // Mutations via shared hooks
  const deleteAccountMutation = useDeleteAccount();
  const updateProfileMutation = useUpdateProfile();
  const updatePasswordMutation = useUpdatePassword();
  const { startAvatarUpload, isUploading: isUpdatingAvatar } =
    useAvatarUpload();

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone. All your posts, comments, votes, and other data will be permanently deleted.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteAccountMutation.mutate(),
        },
      ],
    );
  };

  const handleUnblockAll = () => {
    Alert.alert(
      "Unblock All Users",
      "Are you sure you want to unblock all users? You will be able to see all posts and comments again.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Unblock All",
          onPress: () => unblockAllMutation.mutate(),
        },
      ],
    );
  };

  // Handle avatar update via hook – keep modal open until upload succeeds or fails
  const handleAvatarUpdate = async () => {
    const result = await startAvatarUpload();
    if (result.status === "success") {
      setManageAccountVisible(false);
    }
    // on cancel or error: keep the modal open so the user can try again
  };

  // Handle username update
  const handleUsernameUpdate = (newUsername: string) => {
    if (!newUsername.trim()) {
      Alert.alert("Error", "Username cannot be empty");
      return;
    }
    updateProfileMutation.mutate({ username: newUsername.trim() });
  };

  // Handle password update
  const handlePasswordUpdate = (
    newPassword: string,
    confirmPassword: string,
  ) => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    updatePasswordMutation.mutate(newPassword);
  };

  // Show loading while fetching profile to prevent "User" flicker
  if (isLoadingProfile) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <Text style={[styles.userName, { color: theme.secondaryText }]}>
          Loading...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ProfileHeader
        theme={theme}
        currentUser={currentUser || null}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        totalVotes={totalVotes}
        onAvatarPress={() => setAvatarPreviewVisible(true)}
      />
      <ProfileTabs
        theme={theme}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
      />
      <ProfilePostsList
        theme={theme}
        posts={filteredPosts}
        postScoresMap={postScoresMap}
        commentCountsMap={commentCountsMap}
        isRefetching={isRefetching}
        onRefresh={() => {
          refetchProfile();
          refetchPosts();
        }}
        hasNextPage={activeTab !== "bookmarked" ? hasNextPage : false}
        isFetchingNextPage={isFetchingNextPage}
        onEndReached={fetchNextPage}
      />

      <ProfileSettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        theme={theme}
        isDark={isDark}
        isManualDark={isManualDark}
        toggleTheme={toggleTheme}
        onPressNotifications={() => {
          setSettingsVisible(false);
          setNotificationsVisible(true);
        }}
        onPressTerms={handleOpenTerms}
        onPressPrivacy={handleOpenPrivacy}
        onPressManageAccount={() => {
          setSettingsVisible(false);
          setManageAccountVisible(true);
        }}
      />

      {/* Manage Account Modal */}
      <ManageAccountModal
        visible={manageAccountVisible}
        onClose={() => setManageAccountVisible(false)}
        onLogout={signOut}
        onDeleteAccount={handleDeleteAccount}
        onUnblockAll={handleUnblockAll}
        onUpdateAvatar={handleAvatarUpdate}
        onUpdateUsername={handleUsernameUpdate}
        onUpdatePassword={handlePasswordUpdate}
        isDeleting={deleteAccountMutation.isPending}
        isUnblocking={unblockAllMutation.isPending}
        isUpdating={
          isUpdatingAvatar ||
          updateProfileMutation.isPending ||
          updatePasswordMutation.isPending
        }
        currentUsername={currentUser?.username || ""}
      />

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
      />

      <AvatarPreviewModal
        visible={avatarPreviewVisible}
        onClose={() => setAvatarPreviewVisible(false)}
        avatarUrl={currentUser?.avatar_url || null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
  },
});
