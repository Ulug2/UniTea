import React, { useState } from "react";
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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

const screenWidth = Dimensions.get("window").width;

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isLoading?: boolean;
  reportType: "post" | "comment";
}

export default function ReportModal({
  visible,
  onClose,
  onSubmit,
  isLoading = false,
  reportType,
}: ReportModalProps) {
  const { theme, isDark } = useTheme();
  const keyboardAppearance =
    Platform.OS === "ios" ? (isDark ? "dark" : "light") : undefined;
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (reason.trim()) {
      onSubmit(reason.trim());
      setReason("");
    }
  };

  const handleClose = () => {
    setReason("");
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
        enabled={Platform.OS === "ios"}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
                <MaterialCommunityIcons
                  name="flag"
                  size={moderateScale(20)}
                  color={theme.primary}
                />
                <Text style={[styles.title, { color: theme.text }]}>
                  Report {reportType === "post" ? "Post" : "Comment"}
                </Text>
                <Pressable onPress={handleClose} style={styles.closeButton}>
                  <MaterialCommunityIcons
                    name="close"
                    size={moderateScale(20)}
                    color={theme.secondaryText}
                  />
                </Pressable>
              </View>

              {/* Description */}
              <Text
                style={[styles.description, { color: theme.secondaryText }]}
              >
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
                keyboardAppearance={keyboardAppearance}
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
                  style={[
                    styles.button,
                    styles.cancelButton,
                    { borderColor: theme.border },
                  ]}
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
                      backgroundColor:
                        !reason.trim() || isLoading ? theme.border : "#EF4444",
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
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    padding: moderateScale(20),
  },
  modalContent: {
    width: screenWidth - scale(60),
    maxHeight: "75%",
    borderRadius: moderateScale(16),
    padding: moderateScale(18),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: verticalScale(2),
    },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(3.84),
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: verticalScale(14),
    gap: moderateScale(10),
  },
  title: {
    flex: 1,
    fontSize: moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
  },
  closeButton: {
    padding: moderateScale(4),
  },
  description: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
    marginBottom: verticalScale(14),
    lineHeight: moderateScale(20),
  },
  input: {
    borderWidth: 1,
    borderRadius: moderateScale(12),
    padding: moderateScale(12),
    fontSize: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    minHeight: verticalScale(100),
    maxHeight: verticalScale(140),
  },
  charCount: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    textAlign: "right",
    marginTop: verticalScale(4),
    marginBottom: verticalScale(14),
  },
  actions: {
    flexDirection: "row",
    gap: moderateScale(12),
  },
  button: {
    flex: 1,
    paddingVertical: verticalScale(13),
    borderRadius: moderateScale(12),
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  submitButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_500Medium",
  },
  submitButtonText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_500Medium",
    color: "#FFFFFF",
  },
});
