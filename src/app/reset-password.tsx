import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useTheme } from "../context/ThemeContext";
import { logger } from "../utils/logger";
import CustomInput from "../components/CustomInput";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

type ScreenState = "form" | "loading" | "success" | "link_error";

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? params.code : undefined;

  const [screenState, setScreenState] = useState<ScreenState>(
    code ? "form" : "link_error",
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const validatePasswords = useCallback((): boolean => {
    let valid = true;

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    } else if (!/[A-Z]/.test(newPassword)) {
      setPasswordError("Password must contain at least one uppercase letter.");
      valid = false;
    } else if (!/[a-z]/.test(newPassword)) {
      setPasswordError("Password must contain at least one lowercase letter.");
      valid = false;
    } else {
      setPasswordError("");
    }

    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      valid = false;
    } else {
      setConfirmError("");
    }

    return valid;
  }, [newPassword, confirmPassword]);

  const handleSubmit = useCallback(async () => {
    setGeneralError("");
    if (!validatePasswords()) return;
    if (!code) {
      setScreenState("link_error");
      return;
    }

    setScreenState("loading");
    logger.breadcrumb("Password recovery: exchanging code", "auth");

    try {
      // Exchange the recovery code for a session.
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        logger.error(
          "[ResetPassword] Code exchange failed",
          exchangeError as Error,
        );
        setScreenState("link_error");
        return;
      }

      // Apply the new password.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        logger.error(
          "[ResetPassword] updateUser failed",
          updateError as Error,
        );
        setGeneralError(
          updateError.message ?? "Failed to update password. Please try again.",
        );
        setScreenState("form");
        return;
      }

      // Invalidate every session on every device — this is the security-critical step.
      // The current session is also signed out; the user must sign in again.
      await supabase.auth.signOut({ scope: "global" });

      logger.breadcrumb("Password recovery: complete", "auth");
      setScreenState("success");
    } catch (err) {
      logger.error("[ResetPassword] Unexpected error", err as Error);
      setGeneralError("Something went wrong. Please try again.");
      setScreenState("form");
    }
  }, [code, newPassword, validatePasswords]);

  if (screenState === "success") {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <View style={styles.centeredContainer}>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={styles.successIconWrap}>
              <Ionicons
                name="checkmark-circle"
                size={moderateScale(56)}
                color={theme.primary}
              />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Password Changed
            </Text>
            <Text
              style={[styles.cardSubtitle, { color: theme.secondaryText }]}
            >
              Your password has been updated and you've been signed out of all
              devices. Please sign in with your new password.
            </Text>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => router.replace("/(auth)")}
            >
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === "link_error") {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <View style={styles.centeredContainer}>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Ionicons
              name="alert-circle-outline"
              size={moderateScale(48)}
              color="#EF4444"
              style={styles.errorIcon}
            />
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Link Expired or Invalid
            </Text>
            <Text
              style={[styles.cardSubtitle, { color: theme.secondaryText }]}
            >
              This password reset link has expired or has already been used.
              Request a new one from the sign-in screen.
            </Text>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => router.replace("/(auth)")}
            >
              <Text style={styles.primaryButtonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={styles.centeredContainer}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Set New Password
          </Text>
          <Text style={[styles.cardSubtitle, { color: theme.secondaryText }]}>
            Enter a new password for your account. You'll be signed out of all
            devices after this change.
          </Text>

          {!!generalError && (
            <Text style={styles.generalError}>{generalError}</Text>
          )}

          <CustomInput
            label="New Password"
            leftIcon={{ type: "font-awesome", name: "lock" }}
            value={newPassword}
            onChangeText={(t) => {
              setNewPassword(t);
              if (passwordError) setPasswordError("");
              if (generalError) setGeneralError("");
            }}
            secureTextEntry={!showPassword}
            placeholder="Enter new password"
            autoCapitalize="none"
            errorMessage={passwordError}
            editable={screenState === "form"}
            rightElement={
              <Pressable onPress={() => setShowPassword((p) => !p)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={moderateScale(20)}
                  color={theme.secondaryText}
                />
              </Pressable>
            }
          />

          <CustomInput
            label="Confirm New Password"
            leftIcon={{ type: "font-awesome", name: "lock" }}
            value={confirmPassword}
            onChangeText={(t) => {
              setConfirmPassword(t);
              if (confirmError) setConfirmError("");
            }}
            secureTextEntry={!showConfirm}
            placeholder="Confirm new password"
            autoCapitalize="none"
            errorMessage={confirmError}
            editable={screenState === "form"}
            rightElement={
              <Pressable onPress={() => setShowConfirm((p) => !p)}>
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={moderateScale(20)}
                  color={theme.secondaryText}
                />
              </Pressable>
            }
          />

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: theme.primary },
              screenState === "loading" && styles.disabledButton,
            ]}
            onPress={handleSubmit}
            disabled={screenState === "loading"}
          >
            {screenState === "loading" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.backLink}
            onPress={() => router.replace("/(auth)")}
            disabled={screenState === "loading"}
          >
            <Text style={[styles.backLinkText, { color: theme.primary }]}>
              Back to Sign In
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: moderateScale(24),
  },
  card: {
    borderRadius: moderateScale(24),
    padding: moderateScale(24),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.08,
    shadowRadius: moderateScale(16),
    elevation: 4,
    gap: moderateScale(12),
  },
  successIconWrap: {
    alignItems: "center",
    marginBottom: moderateScale(4),
  },
  errorIcon: {
    alignSelf: "center",
    marginBottom: moderateScale(4),
  },
  cardTitle: {
    fontSize: moderateScale(22),
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  cardSubtitle: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: moderateScale(20),
  },
  generalError: {
    fontSize: moderateScale(13),
    color: "#EF4444",
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  primaryButton: {
    marginTop: moderateScale(4),
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    alignItems: "center",
    justifyContent: "center",
    minHeight: verticalScale(52),
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: moderateScale(16),
    fontFamily: "Poppins_600SemiBold",
  },
  disabledButton: {
    opacity: 0.65,
  },
  backLink: {
    alignItems: "center",
    paddingVertical: verticalScale(4),
  },
  backLinkText: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_500Medium",
  },
});
