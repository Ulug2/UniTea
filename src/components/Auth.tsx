import React, { useCallback } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CustomInput from "./CustomInput";
import { useTheme } from "../context/ThemeContext";
import { PRIVACY_URL, TERMS_URL } from "../constants/links";
import { useAuthFlow } from "../hooks/useAuthFlow";
import { openExternalLink } from "../utils/links";

// Design constants (no more magic numbers!)
const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

const FONT_SIZES = {
  xs: 12,
  sm: 13,
  md: 14,
  base: 15,
  lg: 16,
  xl: 24,
  xxl: 28,
  xxxl: 32,
} as const;

const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 28,
} as const;

const AUTH_CONFIG = {
  TIMEOUT_MS: 30000, // 30 seconds
  RATE_LIMIT_COOLDOWN_MS: 300000, // 5 minutes
  MIN_PASSWORD_LENGTH: 6,
} as const;

export default function Auth() {
  const { theme } = useTheme();
  const {
    email,
    setEmail,
    password,
    setPassword,
    mode,
    setMode,
    privacyAccepted,
    setPrivacyAccepted,
    privacyError,
    setPrivacyError,
    showPassword,
    setShowPassword,
    emailError,
    setEmailError,
    passwordError,
    setPasswordError,
    showResendOption,
    dismissResendOption,
    loadingState,
    isLoading,
    headline,
    helper,
    resendVerificationEmail,
    resetPassword,
    signInWithEmail,
    signUpWithEmail,
  } = useAuthFlow({
    timeoutMs: AUTH_CONFIG.TIMEOUT_MS,
    rateLimitCooldownMs: AUTH_CONFIG.RATE_LIMIT_COOLDOWN_MS,
    minPasswordLength: AUTH_CONFIG.MIN_PASSWORD_LENGTH,
  });

  const handleOpenExternalLink = useCallback(async (url: string) => {
    try {
      await openExternalLink(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Please try again later.";
      Alert.alert("Unable to open link", message);
    }
  }, []);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={styles.hero}>
          <View style={[styles.logoBadge, { backgroundColor: theme.primary }]}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={28}
              color="#fff"
            />
          </View>
          <Text style={[styles.brandTitle, { color: theme.text }]}>UniTee</Text>
          <Text style={[styles.brandSubtitle, { color: theme.secondaryText }]}>
            Your anonymous university community
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, shadowColor: theme.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            {headline}
          </Text>
          <Text style={[styles.cardHelper, { color: theme.secondaryText }]}>
            {helper}
          </Text>

          <CustomInput
            label="University Email"
            leftIcon={{ type: "font-awesome", name: "envelope" }}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError("");
              if (showResendOption) dismissResendOption();
            }}
            value={email}
            placeholder="name.surname@nu.edu.kz"
            autoCapitalize="none"
            keyboardType="email-address"
            errorMessage={emailError}
            editable={!isLoading}
          />

          {mode !== "forgot" && (
            <CustomInput
              label="Password"
              leftIcon={{ type: "font-awesome", name: "lock" }}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordError) setPasswordError("");
              }}
              value={password}
              secureTextEntry={!showPassword}
              placeholder="Enter your password"
              autoCapitalize="none"
              errorMessage={passwordError}
              editable={!isLoading}
              rightElement={
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  disabled={isLoading}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={theme.secondaryText}
                  />
                </Pressable>
              }
            />
          )}

          {mode === "login" && (
            <Pressable
              onPress={() => setMode("forgot")}
              style={styles.forgotButton}
              disabled={isLoading}
            >
              <Text style={[styles.forgotText, { color: theme.primary }]}>
                Forgot password?
              </Text>
            </Pressable>
          )}

          {mode === "signup" && (
            <View style={styles.checkboxBlock}>
              <Pressable
                style={styles.checkboxRow}
                onPress={() => {
                  setPrivacyAccepted((prev) => !prev);
                  if (privacyError) setPrivacyError("");
                }}
                disabled={isLoading}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: privacyAccepted }}
              >
                <Ionicons
                  name={privacyAccepted ? "checkbox" : "square-outline"}
                  size={22}
                  color={privacyAccepted ? theme.primary : theme.secondaryText}
                  style={styles.checkboxIcon}
                />
                <Text style={[styles.checkboxText, { color: theme.text }]}>
                  I agree to the collection of my personal data and the{" "}
                  <Text
                    style={[styles.linkText, { color: theme.primary }]}
                    onPress={() => handleOpenExternalLink(PRIVACY_URL)}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </Pressable>
              {!!privacyError && (
                <Text style={[styles.checkboxError, { color: "#E53935" }]}>
                  {privacyError}
                </Text>
              )}
            </View>
          )}

          {/* Resend verification email button */}
          {showResendOption && (
            <View style={styles.resendContainer}>
              <Text style={[styles.resendText, { color: theme.secondaryText }]}>
                Didn't receive the email?
              </Text>
              <Pressable
                onPress={resendVerificationEmail}
                disabled={loadingState.resend}
                style={styles.resendButton}
              >
                {loadingState.resend ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Text
                    style={[styles.resendButtonText, { color: theme.primary }]}
                  >
                    Resend Email
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: theme.primary },
              isLoading && styles.disabledButton,
            ]}
            disabled={isLoading}
            onPress={
              mode === "login"
                ? signInWithEmail
                : mode === "signup"
                  ? signUpWithEmail
                  : resetPassword
            }
          >
            {(mode === "login" && loadingState.login) ||
            (mode === "signup" && loadingState.signup) ||
            (mode === "forgot" && loadingState.forgot) ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === "login"
                  ? "Log In"
                  : mode === "signup"
                    ? "Create account"
                    : "Send Reset Link"}
              </Text>
            )}
          </Pressable>

          <Text style={[styles.exclusiveNote, { color: theme.secondaryText }]}>
            Only available for Nazarbayev University students
          </Text>

          <View style={styles.switchRow}>
            {mode === "forgot" ? (
              <Pressable
                onPress={() => {
                  setMode("login");
                }}
                style={styles.switchButton}
                disabled={isLoading}
              >
                <Text style={[styles.switchText, { color: theme.primary }]}>
                  Back to Sign in
                </Text>
              </Pressable>
            ) : (
              <>
                <Text style={{ color: theme.secondaryText }}>
                  {mode === "login"
                    ? `Don't have an account?`
                    : "Already a member?"}
                </Text>
                <Pressable
                  onPress={() => {
                    const nextMode = mode === "login" ? "signup" : "login";
                    setMode(nextMode);
                    if (nextMode !== "signup") {
                      setPrivacyAccepted(false);
                      setPrivacyError("");
                    }
                  }}
                  style={styles.switchButton}
                  disabled={isLoading}
                >
                  <Text style={[styles.switchText, { color: theme.primary }]}>
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <Text style={[styles.tosText, { color: theme.secondaryText }]}>
          By continuing, you agree to our{" "}
          <Text
            style={[styles.linkText, { color: theme.primary }]}
            onPress={() => handleOpenExternalLink(TERMS_URL)}
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={[styles.linkText, { color: theme.primary }]}
            onPress={() => handleOpenExternalLink(PRIVACY_URL)}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xl,
    justifyContent: "center",
  },
  hero: {
    alignItems: "center",
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: BORDER_RADIUS.xl,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  brandTitle: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: "700",
  },
  brandSubtitle: {
    fontSize: FONT_SIZES.base,
    textAlign: "center",
  },
  card: {
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    gap: SPACING.md,
    shadowOffset: { width: 0, height: SPACING.lg + 2 },
    shadowOpacity: 0.08,
    shadowRadius: BORDER_RADIUS.xxl,
    elevation: 4,
  },
  cardTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    textAlign: "center",
  },
  cardHelper: {
    fontSize: FONT_SIZES.md,
    textAlign: "center",
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
  },
  forgotText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  resendContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  resendText: {
    fontSize: FONT_SIZES.sm,
  },
  resendButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  resendButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  checkboxBlock: {
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: SPACING.xs,
  },
  checkboxIcon: {
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  checkboxText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    lineHeight: FONT_SIZES.lg,
  },
  checkboxError: {
    fontSize: FONT_SIZES.xs,
    marginLeft: SPACING.xl,
  },
  primaryButton: {
    marginTop: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.65,
  },
  exclusiveNote: {
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  switchButton: {
    paddingVertical: 2,
    paddingHorizontal: SPACING.xs,
  },
  switchText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
  },
  tosText: {
    marginTop: SPACING.lg,
    textAlign: "center",
    fontSize: FONT_SIZES.xs,
    lineHeight: BORDER_RADIUS.lg,
  },
  linkText: {
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
