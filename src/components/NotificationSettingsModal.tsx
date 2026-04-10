import React from "react";
import {
  Alert,
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

type NotificationSettings = {
  user_id: string;
  push_token: string | null;
  notify_chats: boolean;
  notify_upvotes: boolean;
};

interface NotificationSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationSettingsModal({
  visible,
  onClose,
}: NotificationSettingsModalProps) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  const {
    data: settings,
    isLoading,
    isFetching,
  } = useQuery<NotificationSettings | null>({
    queryKey: ["notification-settings", userId],
    enabled: Boolean(userId) && visible,
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (!data) {
        // If we don't yet have a settings row, reflect the current OS permission
        // state so toggles aren't shown ON when the device can't receive pushes.
        const { status } = await Notifications.getPermissionsAsync();
        const granted = status === "granted";
        return {
          user_id: userId,
          push_token: null,
          notify_chats: granted,
          notify_upvotes: granted,
        };
      }

      return data as NotificationSettings;
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({
      field,
      value,
    }: {
      field: "notify_chats" | "notify_upvotes";
      value: boolean;
    }) => {
      if (!userId) throw new Error("User ID missing");

      const { error } = await supabase.from("notification_settings").upsert(
        {
          user_id: userId,
          [field]: value,
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;
    },
    onMutate: async ({ field, value }) => {
      await queryClient.cancelQueries({
        queryKey: ["notification-settings", userId],
      });

      const previous = queryClient.getQueryData<NotificationSettings | null>([
        "notification-settings",
        userId,
      ]);

      if (previous) {
        queryClient.setQueryData<NotificationSettings | null>(
          ["notification-settings", userId],
          {
            ...previous,
            [field]: value,
          }
        );
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["notification-settings", userId],
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["notification-settings", userId],
      });
    },
  });

  const isBusy = isLoading || isFetching;

  const handleToggle =
    (field: "notify_chats" | "notify_upvotes") => async (value: boolean) => {
      // Turning OFF doesn't require any OS permission.
      if (!value) {
        updateSettingMutation.mutate({ field, value });
        return;
      }

      const { status, canAskAgain } = await Notifications.getPermissionsAsync();

      // Request permissions if allowed; otherwise fall back to OS settings.
      if (status !== "granted") {
        if (canAskAgain) {
          const { status: newStatus } =
            await Notifications.requestPermissionsAsync();
          if (newStatus !== "granted") {
            // Hard deny / denial: clear both toggles + token.
            await supabase.from("notification_settings").upsert(
              {
                user_id: userId!,
                push_token: null,
                notify_chats: false,
                notify_upvotes: false,
              },
              { onConflict: "user_id" }
            );
            queryClient.invalidateQueries({
              queryKey: ["notification-settings", userId],
            });

            Alert.alert(
              "Notifications Disabled",
              "Push notifications were denied. Enable them in your device settings to receive alerts."
            );
            return;
          }
        } else {
          // Hard-denied: native prompt won't show again.
          await supabase.from("notification_settings").upsert(
            {
              user_id: userId!,
              push_token: null,
              notify_chats: false,
              notify_upvotes: false,
            },
            { onConflict: "user_id" }
          );
          queryClient.invalidateQueries({
            queryKey: ["notification-settings", userId],
          });

          Alert.alert(
            "Notifications Disabled",
            "Push notifications are disabled on your device. Please enable them in Settings to receive alerts.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
      }

      // At this point, OS permission is granted.
      const expoProjectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      if (!expoProjectId) {
        Alert.alert(
          "Notifications Setup Error",
          "Expo projectId is missing. Please check app.json/app.config."
        );
        return;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: expoProjectId,
      });

      // Preserve the other toggle value (if we already have one loaded),
      // but ensure the toggled one becomes true.
      const prevNotifyChats = settings?.notify_chats ?? false;
      const prevNotifyUpvotes = settings?.notify_upvotes ?? false;

      await supabase.from("notification_settings").upsert(
        {
          user_id: userId!,
          push_token: token.data,
          notify_chats: field === "notify_chats" ? true : prevNotifyChats,
          notify_upvotes: field === "notify_upvotes" ? true : prevNotifyUpvotes,
        },
        { onConflict: "user_id" }
      );

      queryClient.invalidateQueries({
        queryKey: ["notification-settings", userId],
      });
    };

  const effectiveSettings: NotificationSettings = settings || {
    user_id: userId || "",
    push_token: null,
    // If we don't yet have a settings row, default based on current OS permission.
    // We never request permission here automatically.
    notify_chats: false,
    notify_upvotes: false,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View
          style={[styles.modalContent, { backgroundColor: theme.card }]}
          onStartShouldSetResponder={() => true}
        >
          <View
            style={[styles.modalHandle, { backgroundColor: theme.border }]}
          />

          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Notification Preferences
          </Text>

          {isBusy && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text
                style={[styles.loadingText, { color: theme.secondaryText }]}
              >
                Loading settings...
              </Text>
            </View>
          )}

          <View style={styles.optionRow}>
            <View style={styles.optionLeft}>
              <Ionicons
                name="chatbubble-outline"
                size={moderateScale(22)}
                color={theme.text}
              />
              <Text style={[styles.optionLabel, { color: theme.text }]}>
                Chat Messages
              </Text>
            </View>
            <Switch
              value={effectiveSettings.notify_chats}
              onValueChange={handleToggle("notify_chats")}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={"white"}
            />
          </View>

          <View style={styles.optionRow}>
            <View style={styles.optionLeft}>
              <MaterialCommunityIcons
                name="arrow-up-bold-outline"
                size={moderateScale(22)}
                color={theme.text}
              />
              <Text style={[styles.optionLabel, { color: theme.text }]}>
                Upvotes
              </Text>
            </View>
            <Switch
              value={effectiveSettings.notify_upvotes}
              onValueChange={handleToggle("notify_upvotes")}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={"white"}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(32),
    paddingHorizontal: scale(20),
  },
  modalHandle: {
    width: scale(40),
    height: verticalScale(4),
    borderRadius: moderateScale(2),
    alignSelf: "center",
    marginBottom: verticalScale(16),
  },
  modalTitle: {
    fontSize: moderateScale(20),
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    marginBottom: verticalScale(16),
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(8),
    marginBottom: verticalScale(16),
  },
  loadingText: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: verticalScale(16),
    borderBottomWidth: 1,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(12),
  },
  optionLabel: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_500Medium",
  },
});
