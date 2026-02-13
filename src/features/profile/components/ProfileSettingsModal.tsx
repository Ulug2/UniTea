import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Theme } from "../../../context/ThemeContext";

type ProfileSettingsModalProps = {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  onPressNotifications: () => void;
  onPressTerms: () => void;
  onPressPrivacy: () => void;
  onPressManageAccount: () => void;
};

export function ProfileSettingsModal({
  visible,
  onClose,
  theme,
  isDark,
  toggleTheme,
  onPressNotifications,
  onPressTerms,
  onPressPrivacy,
  onPressManageAccount,
}: ProfileSettingsModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
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
            Settings
          </Text>

          <ScrollView style={styles.settingsScroll}>
            {/* Dark Mode Toggle */}
            <Pressable
              style={[styles.settingRow, { borderBottomColor: theme.border }]}
            >
              <View style={styles.settingLeft}>
                <Ionicons name="moon-outline" size={22} color={theme.text} />
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  Dark Mode
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={isDark ? "#fff" : "#f4f3f4"}
              />
            </Pressable>

            {/* Notifications */}
            <Pressable
              style={[styles.settingRow, { borderBottomColor: theme.border }]}
              onPress={onPressNotifications}
            >
              <View style={styles.settingLeft}>
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color={theme.text}
                />
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  Notifications
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.secondaryText}
              />
            </Pressable>

            {/* Terms of Service */}
            <Pressable
              style={[styles.settingRow, { borderBottomColor: theme.border }]}
              onPress={onPressTerms}
            >
              <View style={styles.settingLeft}>
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color={theme.text}
                />
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  Terms of Service
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.secondaryText}
              />
            </Pressable>

            {/* Privacy Policy */}
            <Pressable
              style={[styles.settingRow, { borderBottomColor: theme.border }]}
              onPress={onPressPrivacy}
            >
              <View style={styles.settingLeft}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={22}
                  color={theme.text}
                />
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  Privacy Policy
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.secondaryText}
              />
            </Pressable>

            {/* Manage Account */}
            <Pressable
              style={[styles.settingRow, { borderBottomColor: theme.border }]}
              onPress={onPressManageAccount}
            >
              <View style={styles.settingLeft}>
                <MaterialCommunityIcons
                  name="account-cog"
                  size={22}
                  color={theme.text}
                />
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  Manage Account
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.secondaryText}
              />
            </Pressable>
          </ScrollView>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: "80%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 19,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 12,
  },
  settingsScroll: {
    marginTop: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
});

