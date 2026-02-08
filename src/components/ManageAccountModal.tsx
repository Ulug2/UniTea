import React, { useState } from 'react';
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
  Platform,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface ManageAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onUnblockAll: () => void;
  onUpdateAvatar: () => void;
  onUpdateUsername: (username: string) => void;
  onUpdatePassword: (password: string, confirmPassword: string) => void;
  isDeleting?: boolean;
  isUnblocking?: boolean;
  isUpdating?: boolean;
  currentUsername?: string;
}

type ViewType = 'menu' | 'username' | 'password';

export default function ManageAccountModal({
  visible,
  onClose,
  onLogout,
  onDeleteAccount,
  onUnblockAll,
  onUpdateAvatar,
  onUpdateUsername,
  onUpdatePassword,
  isDeleting = false,
  isUnblocking = false,
  isUpdating = false,
  currentUsername = '',
}: ManageAccountModalProps) {
  const { theme, isDark } = useTheme();
  const [currentView, setCurrentView] = useState<ViewType>('menu');
  const [username, setUsername] = useState(currentUsername);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Reset form when modal closes
  React.useEffect(() => {
    if (!visible) {
      setCurrentView('menu');
      setUsername(currentUsername);
      setPassword('');
      setConfirmPassword('');
    } else {
      setUsername(currentUsername);
    }
  }, [visible, currentUsername]);

  const handleUsernameSave = () => {
    if (!username.trim()) {
      return;
    }
    onUpdateUsername(username.trim());
    setCurrentView('menu');
  };

  const handlePasswordSave = () => {
    if (!password || !confirmPassword) {
      return;
    }
    onUpdatePassword(password, confirmPassword);
    setPassword('');
    setConfirmPassword('');
    setCurrentView('menu');
  };

  const renderMenu = () => (
    <>
      <Text style={[styles.modalTitle, { color: theme.text }]}>
        Manage Account
      </Text>

      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        {/* Change Avatar */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={onUpdateAvatar}
          disabled={isUpdating}
        >
          <View style={styles.optionLeft}>
            <MaterialCommunityIcons
              name="account-circle-outline"
              size={22}
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
              size={20}
              color={theme.secondaryText}
            />
          )}
        </Pressable>

        {/* Change Username */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={() => setCurrentView('username')}
          disabled={isUpdating}
        >
          <View style={styles.optionLeft}>
            <MaterialCommunityIcons
              name="account-edit-outline"
              size={22}
              color={theme.text}
            />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Change Username
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.secondaryText}
          />
        </Pressable>

        {/* Change Password */}
        <Pressable
          style={[styles.option, { borderBottomColor: theme.border }]}
          onPress={() => setCurrentView('password')}
          disabled={isUpdating}
        >
          <View style={styles.optionLeft}>
            <MaterialCommunityIcons
              name="lock-outline"
              size={22}
              color={theme.text}
            />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Change Password
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
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
            <Ionicons name="log-out-outline" size={22} color={theme.text} />
            <Text style={[styles.optionLabel, { color: theme.text }]}>
              Log Out
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
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
              size={22}
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
              size={20}
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
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
            <Text style={[styles.optionLabel, { color: "#EF4444" }]}>
              Delete Account
            </Text>
          </View>
          {isDeleting ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={20}
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
          onPress={() => setCurrentView('menu')}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.modalTitle, { color: theme.text, flex: 1 }]}>
          Change Username
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
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
          keyboardAppearance={isDark ? "dark" : "light"}
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
              backgroundColor: username.trim() && !isUpdating ? theme.primary : theme.border,
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
          onPress={() => setCurrentView('menu')}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.modalTitle, { color: theme.text, flex: 1 }]}>
          Change Password
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
        <Text style={[styles.label, { color: theme.secondaryText }]}>
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
          keyboardAppearance={isDark ? "dark" : "light"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: theme.secondaryText, marginTop: 16 }]}>
          Confirm Password
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
          keyboardAppearance={isDark ? "dark" : "light"}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable
          style={[
            styles.saveButton,
            {
              backgroundColor:
                password && confirmPassword && !isUpdating ? theme.primary : theme.border,
            },
          ]}
          onPress={handlePasswordSave}
          disabled={!password || !confirmPassword || isUpdating}
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
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={onClose}
      >
        <View
          style={[styles.modalContent, { backgroundColor: theme.card }]}
          onStartShouldSetResponder={() => true}
        >
          <View
            style={[styles.modalHandle, { backgroundColor: theme.border }]}
          />
          {currentView === 'menu' && renderMenu()}
          {currentView === 'username' && renderUsernameForm()}
          {currentView === 'password' && renderPasswordForm()}
        </View>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '60%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  optionsContainer: {
    paddingHorizontal: 20,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: 'Poppins_500Medium',
  },
  formContainer: {
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 16,
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
  },
});
