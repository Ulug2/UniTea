import React from "react";
import { Modal, Pressable, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import {
  useFontScale,
  type FontScalePreference,
} from "../context/FontScaleContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

interface TextSizeSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

const OPTIONS: { value: FontScalePreference; label: string; sample: number }[] = [
  { value: "automatic", label: "Automatic", sample: moderateScale(15) },
  { value: "small", label: "Small", sample: moderateScale(14) },
  { value: "default", label: "Default", sample: moderateScale(15) },
  { value: "large", label: "Large", sample: moderateScale(17) },
];

export default function TextSizeSettingsModal({
  visible,
  onClose,
}: TextSizeSettingsModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { preference, setPreference, resetToAutomatic } = useFontScale();

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

          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Text Size
          </Text>
          <Text
            style={[styles.modalSubtitle, { color: theme.secondaryText }]}
          >
            Automatic follows your device's accessibility text size setting.
          </Text>

          {OPTIONS.map((option) => {
            const isSelected = preference === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.optionRow, { borderBottomColor: theme.border }]}
                onPress={() => setPreference(option.value)}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: theme.text, fontSize: option.sample },
                  ]}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={moderateScale(20)}
                    color={theme.primary}
                  />
                )}
              </Pressable>
            );
          })}

          {preference !== "automatic" && (
            <Pressable style={styles.resetRow} onPress={resetToAutomatic}>
              <Text style={[styles.resetLabel, { color: theme.primary }]}>
                Reset to Automatic
              </Text>
            </Pressable>
          )}
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
    marginBottom: verticalScale(6),
  },
  modalSubtitle: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    marginBottom: verticalScale(12),
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: verticalScale(16),
    borderBottomWidth: 1,
  },
  optionLabel: {
    fontFamily: "Poppins_500Medium",
  },
  resetRow: {
    alignItems: "center",
    paddingTop: verticalScale(16),
  },
  resetLabel: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_600SemiBold",
  },
});
