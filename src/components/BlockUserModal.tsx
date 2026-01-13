import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const screenWidth = Dimensions.get('window').width;

interface BlockUserModalProps {
  visible: boolean;
  onClose: () => void;
  onBlock: () => void;
  isLoading?: boolean;
  username: string;
}

export default function BlockUserModal({
  visible,
  onClose,
  onBlock,
  isLoading = false,
  username,
}: BlockUserModalProps) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
            {/* Icon */}
            <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
              <MaterialCommunityIcons
                name="account-cancel"
                size={32}
                color="#EF4444"
              />
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: theme.text }]}>
              Block @{username}?
            </Text>

            {/* Description */}
            <Text style={[styles.description, { color: theme.secondaryText }]}>
              You won't see each other's posts or comments. You can unblock them later from settings.
            </Text>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.cancelButton, { borderColor: theme.border }]}
                onPress={onClose}
                disabled={isLoading}
              >
                <Text style={[styles.buttonText, { color: theme.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  styles.blockButton,
                  {
                    backgroundColor: isLoading ? theme.border : '#EF4444',
                  },
                ]}
                onPress={onBlock}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.blockButtonText}>Block User</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: screenWidth - 60, // 30px padding on each side
    borderRadius: 16,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    alignItems: 'center',
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 21,
    marginBottom: 22,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  blockButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
  },
  blockButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
    color: '#FFFFFF',
  },
});
