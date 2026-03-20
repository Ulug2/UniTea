import React from "react";
import { Text, StyleSheet } from "react-native";
import { useTheme } from "../../../context/ThemeContext";

const FOUNDING_FATHER_GOLD_DARK = "#FFD700";
const FOUNDING_FATHER_GOLD_LIGHT = "#B8860B";

export function FoundingBadge() {
  const { isDark } = useTheme();
  const color = isDark ? FOUNDING_FATHER_GOLD_DARK : FOUNDING_FATHER_GOLD_LIGHT;

  return <Text style={[styles.label, { color }]}>{"Founding Member"}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    lineHeight: 18,
    marginTop: 6,
  },
});
