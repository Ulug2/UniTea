import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  PixelRatio,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

interface ManageAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onUnblockAll: () => void;
  onUpdateAvatar: () => void;
  onUpdateUsername: (username: string) => void;
  onUpdatePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => void;
  onForgotPassword?: () => void;
  isDeleting?: boolean;
  isUnblocking?: boolean;
  isUpdating?: boolean;
  currentUsername?: string;
}

type ViewType = "menu" | "username" | "password";

export default function ManageAccountModal({
  visible,
  onClose,
  onLogout,
  onDeleteAccount,
  onUnblockAll,
  onUpdateAvatar,
  onUpdateUsername,
  onUpdatePassword,
  onForgotPassword,
  isDeleting = false,
  isUnblocking = false,
  isUpdating = false,
  currentUsername = "",
}: ManageAccountModalProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const fontScale = PixelRatio.getFontScale();
  const rowIconSize = moderateScale(22) * fontScale;
  const chevronIconSize = moderateScale(20) * fontScale;
  const backIconSize = moderateScale(24) * fontScale;
  const keyboardAppearance =
    Platform.OS === "ios" ? (isDark ? "dark" : "light") : undefined;
  const [currentView, setCurrentView] = useState<ViewType>("menu");
  const [username, setUsername] = useState(currentUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Android: lift the bottom sheet above the keyboard manually since
  // adjustResize is broken with edgeToEdgeEnabled:true on API 30+.
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setAndroidKeyboardInset(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setAndroidKeyboardInset(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Reset form when modal closes
  React.useEffect(() => {
    if (!visible) {
      setCurrentView("menu");
      setUsername(currentUsername);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setAndroidKeyboardInset(0);
    } else {
      setUsername(currentUsername);
    }
  }, [visible, currentUsername]);

  const handleUsernameSave = () => {
    if (!username.trim()) {
      return;
    }
    onUpdateUsername(username.trim());
    setCurrentView("menu");
  };

  const handlePasswordSave = () => {
    if (!currentPassword || !password || !confirmPassword) {
      return;
    }
    onUpdatePassword(currentPassword, password, confirmPassword);
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    setCurrentView("menu");
  };

  const renderMenu = () => (
    <>
      <Text style={[styles.modalTitle, { color: theme.text }]}>
        Manage Account
      </Text>

      <ScrollView
        style={styles.optionsContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Change Avatar */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={onUpdateAvatar}
          disabled={isUpdating}
        >
          <View style={styles.optionLeft}>
            <MaterialCommunityIcons
              name="account-circle-outline"
              size={rowIconSize}
              color={theme.text}
            />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Change Avatar
            </Text>
          </View>
          {isUpdating ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={chevronIconSize}
              color={theme.secondaryText}
            />
          )}
        </Pressable>

        {/* Change Username */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={() => setCurrentView("username")}
          disabled={isUpdating}
        >
          <View style={styles.optionLeft}>
            <MaterialCommunityIcons
              name="account-edit-outline"
              size={rowIconSize}
              color={theme.text}
            />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Change Username
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={chevronIconSize}
            color={theme.secondaryText}
          />
        </Pressable>

        {/* Change Password */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={() => setCurrentView("password")}
          disabled={isUpdating}
        >
          <View style={styles.optionLeft}>
            <MaterialCommunityIcons
              name="lock-outline"
              size={rowIconSize}
              color={theme.text}
            />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Change Password
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={chevronIconSize}
            color={theme.secondaryText}
          />
        </Pressable>

        {/* Logout */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={() => {
            onClose();
            onLogout();
          }}
        >
          <View style={styles.optionLeft}>
            <Ionicons
              name="log-out-outline"
              size={rowIconSize}
              color={theme.text}
            />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Log Out
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={chevronIconSize}
            color={theme.secondaryText}
          />
        </Pressable>

        {/* Unblock All */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={onUnblockAll}
          disabled={isUnblocking}
        >
          <View style={styles.optionLeft}>
            <MaterialCommunityIcons
              name="account-check-outline"
              size={rowIconSize}
              color={theme.text}
            />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Unblock All Users
            </Text>
          </View>
          {isUnblocking ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={chevronIconSize}
              color={theme.secondaryText}
            />
          )}
        </Pressable>

        {/* Delete Account */}
        <Pressable
          style={styles.option}
          onPress={onDeleteAccount}
          disabled={isDeleting}
        >
          <View style={styles.optionLeft}>
            <Ionicons name="trash-outline" size={rowIconSize} color="#EF4444" />
            <Text style={[styles.optionLabel, { color: "#EF4444" }]}>
              Delete Account
            </Text>
          </View>
          {isDeleting ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={chevronIconSize}
              color={theme.secondaryText}
            />
          )}
        </Pressable>
      </ScrollView>
    </>
  );

  const renderUsernameForm = () => (
    <>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => setCurrentView("menu")}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={backIconSize}
            color={theme.text}
          />
        </Pressable>
        <Text style={[styles.modalTitle, { color: theme.text, flex: 1 }]}>
          Change Username
        </Text>
        <View style={{ width: scale(40) }} />
      </View>

      <ScrollView
        style={styles.formContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.label, { color: theme.secondaryText }]}>
          Username
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholder="Enter new username"
          placeholderTextColor={theme.secondaryText}
          keyboardAppearance={keyboardAppearance}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={50}
        />

        <Pressable
          style={[
            styles.saveButton,
            {
              backgroundColor:
                username.trim() && !isUpdating ? theme.primary : theme.border,
            },
          ]}
          onPress={handleUsernameSave}
          disabled={!username.trim() || isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );

  const renderPasswordForm = () => (
    <>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => setCurrentView("menu")}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={backIconSize}
            color={theme.text}
          />
        </Pressable>
        <Text style={[styles.modalTitle, { color: theme.text, flex: 1 }]}>
          Change Password
        </Text>
        <View style={{ width: scale(40) }} />
      </View>

      <ScrollView
        style={styles.formContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.label, { color: theme.secondaryText }]}>
          Current Password
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholder="Enter current password"
          placeholderTextColor={theme.secondaryText}
          keyboardAppearance={keyboardAppearance}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
        />

        {onForgotPassword && (
          <Pressable
            onPress={() => {
              setCurrentPassword("");
              setPassword("");
              setConfirmPassword("");
              setCurrentView("menu");
              onForgotPassword();
            }}
            style={styles.forgotPasswordLink}
          >
            <Text style={[styles.forgotPasswordText, { color: theme.primary }]}>
              Forgot Password?
            </Text>
          </Pressable>
        )}

        <Text
          style={[
            styles.label,
            { color: theme.secondaryText, marginTop: verticalScale(16) },
          ]}
        >
          New Password
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholder="Enter new password"
          placeholderTextColor={theme.secondaryText}
          keyboardAppearance={keyboardAppearance}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />

        <Text
          style={[
            styles.label,
            { color: theme.secondaryText, marginTop: verticalScale(4) },
          ]}
        >
          Confirm New Password
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholder="Confirm new password"
          placeholderTextColor={theme.secondaryText}
          keyboardAppearance={keyboardAppearance}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />

        <Pressable
          style={[
            styles.saveButton,
            {
              backgroundColor:
                currentPassword && password && confirmPassword && !isUpdating
                  ? theme.primary
                  : theme.border,
            },
          ]}
          onPress={handlePasswordSave}
          disabled={!currentPassword || !password || !confirmPassword || isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        enabled={Platform.OS === "ios"}
      >
        <Pressable
          style={[
            styles.modalOverlay,
            Platform.OS === "android" && {
              paddingBottom: androidKeyboardInset,
            },
          ]}
          onPress={onClose}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                paddingBottom: Math.max(insets.bottom, verticalScale(32)),
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={[styles.modalHandle, { backgroundColor: theme.border }]}
            />
            {currentView === "menu" && renderMenu()}
            {currentView === "username" && renderUsernameForm()}
            {currentView === "password" && renderPasswordForm()}
          </View>
        </Pressable>
      </KeyboardAvoidingView>
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
    maxHeight: "60%",
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: verticalScale(16),
    paddingHorizontal: scale(20),
  },
  backButton: {
    padding: moderateScale(4),
    marginRight: scale(8),
  },
  optionsContainer: {
    paddingHorizontal: scale(20),
  },
  option: {
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
  formContainer: {
    paddingHorizontal: scale(20),
  },
  label: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_500Medium",
    marginBottom: verticalScale(8),
  },
  input: {
    borderWidth: 1,
    borderRadius: moderateScale(12),
    padding: moderateScale(14),
    fontSize: moderateScale(16),
    fontFamily: "Poppins_400Regular",
    marginBottom: verticalScale(16),
  },
  saveButton: {
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    alignItems: "center",
    justifyContent: "center",
    marginTop: verticalScale(8),
  },
  saveButtonText: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_600SemiBold",
    color: "#FFFFFF",
  },
  forgotPasswordLink: {
    alignSelf: "flex-end",
    paddingVertical: verticalScale(4),
    marginBottom: verticalScale(4),
  },
  forgotPasswordText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
});
