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
import { moderateScale, scale, verticalScale } from '../utils/scaling';

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
                size={moderateScale(32)}
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
    padding: moderateScale(20),
  },
  modalContent: {
    width: screenWidth - scale(60), // scaled inset each side
    borderRadius: moderateScale(16),
    padding: moderateScale(22),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: verticalScale(2),
    },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(3.84),
    elevation: 5,
    alignItems: 'center',
  },
  iconContainer: {
    width: scale(60),
    height: verticalScale(60),
    borderRadius: moderateScale(30),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  title: {
    fontSize: moderateScale(19),
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: verticalScale(12),
    textAlign: 'center',
  },
  description: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_400Regular',
    lineHeight: moderateScale(21),
    marginBottom: verticalScale(22),
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: moderateScale(12),
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: verticalScale(13),
    borderRadius: moderateScale(12),
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
    fontSize: moderateScale(15),
    fontFamily: 'Poppins_500Medium',
  },
  blockButtonText: {
    fontSize: moderateScale(15),
    fontFamily: 'Poppins_500Medium',
    color: '#FFFFFF',
  },
});
