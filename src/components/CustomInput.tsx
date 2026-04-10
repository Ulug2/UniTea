import React, { ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  Platform,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

interface CustomInputProps extends TextInputProps {
  label?: string;
  leftIcon?: { type: string; name: string };
  errorMessage?: string;
  rightElement?: ReactNode;
}

export default function CustomInput({
  label,
  leftIcon,
  errorMessage,
  style,
  rightElement,
  ...textInputProps
}: CustomInputProps) {
  const { theme, isDark } = useTheme();
  const keyboardAppearance =
    Platform.OS === "ios" ? (isDark ? "dark" : "light") : undefined;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      )}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.card,
            borderColor: errorMessage ? "#FF3B30" : theme.border,
          },
        ]}
      >
        {leftIcon && leftIcon.type === "font-awesome" && (
          <FontAwesome
            name={leftIcon.name as any}
            size={moderateScale(20)}
            color={theme.secondaryText}
            style={styles.icon}
          />
        )}
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholderTextColor={theme.secondaryText}
          keyboardAppearance={keyboardAppearance}
          {...textInputProps}
        />
        {rightElement && (
          <View style={styles.rightElement}>{rightElement}</View>
        )}
      </View>
      {errorMessage && (
        <Text style={[styles.errorText, { color: "#FF3B30" }]}>
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: verticalScale(16),
  },
  label: {
    fontSize: moderateScale(16),
    fontWeight: "600",
    marginBottom: verticalScale(8),
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(12),
    minHeight: verticalScale(48),
  },
  icon: {
    marginRight: scale(10),
  },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    paddingVertical: verticalScale(12),
  },
  rightElement: {
    marginLeft: scale(8),
  },
  errorText: {
    fontSize: moderateScale(12),
    marginTop: verticalScale(4),
    marginLeft: scale(4),
  },
});
