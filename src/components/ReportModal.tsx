import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const screenWidth = Dimensions.get('window').width;

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isLoading?: boolean;
  reportType: 'post' | 'comment';
}

export default function ReportModal({
  visible,
  onClose,
  onSubmit,
  isLoading = false,
  reportType,
}: ReportModalProps) {
  const { theme, isDark } = useTheme();
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (reason.trim()) {
      onSubmit(reason.trim());
      setReason('');
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
                <MaterialCommunityIcons
                  name="flag"
                  size={20}
                  color={theme.primary}
                />
                <Text style={[styles.title, { color: theme.text }]}>
                  Report {reportType === 'post' ? 'Post' : 'Comment'}
                </Text>
                <Pressable onPress={handleClose} style={styles.closeButton}>
                  <MaterialCommunityIcons
                    name="close"
                    size={20}
                    color={theme.secondaryText}
                  />
                </Pressable>
              </View>

              {/* Description */}
              <Text style={[styles.description, { color: theme.secondaryText }]}>
                What's wrong with this {reportType}?
              </Text>

              {/* Text Input */}
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Describe the issue..."
                placeholderTextColor={theme.secondaryText}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                multiline
                numberOfLines={4}
                value={reason}
                onChangeText={setReason}
                textAlignVertical="top"
                maxLength={300}
              />
              <Text style={[styles.charCount, { color: theme.secondaryText }]}>
                {reason.length}/300
              </Text>

              {/* Action Buttons */}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.button, styles.cancelButton, { borderColor: theme.border }]}
                  onPress={handleClose}
                  disabled={isLoading}
                >
                  <Text style={[styles.buttonText, { color: theme.text }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.button,
                    styles.submitButton,
                    {
                      backgroundColor: !reason.trim() || isLoading ? theme.border : '#EF4444',
                    },
                  ]}
                  onPress={handleSubmit}
                  disabled={!reason.trim() || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
    maxHeight: '75%',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    minHeight: 100,
    maxHeight: 140,
  },
  charCount: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
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
  submitButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
  },
  submitButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
    color: '#FFFFFF',
  },
});
