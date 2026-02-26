import React from "react";
import { Text, StyleSheet } from "react-native";
import type { Theme } from "../../../context/ThemeContext";

type FoundingBadgeProps = {
  theme: Theme;
};

export function FoundingBadge({ theme }: FoundingBadgeProps) {
  return (
    <Text style={[styles.label, { color: theme.primary }]}>
      {"Founding Father"}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    lineHeight: 18,
    marginTop: 6,
  },
});
