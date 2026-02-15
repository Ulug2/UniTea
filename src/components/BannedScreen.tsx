import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { router } from "expo-router";

type BannedScreenProps = {
  isPermanent: boolean;
  bannedUntil?: string | null;
};

export default function BannedScreen({
  isPermanent,
  bannedUntil,
}: BannedScreenProps) {
  const { theme } = useTheme();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/(auth)");
  };

  const untilText =
    !isPermanent && bannedUntil
      ? new Date(bannedUntil).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <MaterialCommunityIcons
          name="account-cancel"
          size={64}
          color={theme.error ?? "#EF4444"}
          style={styles.icon}
        />
        <Text style={[styles.title, { color: theme.text }]}>
          Account suspended
        </Text>
        <Text style={[styles.message, { color: theme.secondaryText }]}>
          Your account has been banned from using this app.
          {isPermanent
            ? " This ban is permanent."
            : untilText
              ? ` You may appeal after ${untilText}.`
              : ""}
        </Text>
        <Pressable
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={handleSignOut}
        >
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    maxWidth: 360,
    width: "100%",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 160,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
