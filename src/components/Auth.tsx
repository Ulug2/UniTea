import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CustomInput from "./CustomInput";
import { useTheme } from "../context/ThemeContext";
import { PRIVACY_URL, TERMS_URL } from "../constants/links";
import { useAuthFlow } from "../hooks/useAuthFlow";
import { openExternalLink } from "../utils/links";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

// Design constants (scaled from iPhone 15 Plus baseline)
const SPACING = {
  xs: moderateScale(4),
  sm: moderateScale(8),
  md: moderateScale(16),
  lg: moderateScale(24),
  xl: moderateScale(32),
  xxl: moderateScale(48),
} as const;

const FONT_SIZES = {
  xs: moderateScale(12),
  sm: moderateScale(13),
  md: moderateScale(14),
  base: moderateScale(15),
  lg: moderateScale(16),
  xl: moderateScale(24),
  xxl: moderateScale(28),
  xxxl: moderateScale(32),
} as const;

const BORDER_RADIUS = {
  sm: moderateScale(8),
  md: moderateScale(12),
  lg: moderateScale(18),
  xl: moderateScale(24),
  xxl: moderateScale(28),
} as const;

const AUTH_CONFIG = {
  TIMEOUT_MS: 30000, // 30 seconds
  RATE_LIMIT_COOLDOWN_MS: 300000, // 5 minutes
  MIN_PASSWORD_LENGTH: 8,
  EMAIL_REQUEST_COOLDOWN_SECONDS: 60,
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
    isEmailRequestCooldownActive,
    emailRequestCooldownSecondsRemaining,
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
    emailRequestCooldownSeconds: AUTH_CONFIG.EMAIL_REQUEST_COOLDOWN_SECONDS,
  });

  const isPrimaryEmailRequestMode = mode === "signup" || mode === "forgot";
  const isPrimaryButtonDisabled =
    isLoading || (isPrimaryEmailRequestMode && isEmailRequestCooldownActive);

  const [authToggleWidth, setAuthToggleWidth] = useState(0);
  const authToggleTranslateX = useSharedValue(0);

  const switchAuthMode = useCallback(
    (nextMode: "login" | "signup") => {
      setMode(nextMode);
      if (nextMode !== "signup") {
        setPrivacyAccepted(false);
        setPrivacyError("");
      }
      if (showResendOption) dismissResendOption();
    },
    [
      dismissResendOption,
      setMode,
      setPrivacyAccepted,
      setPrivacyError,
      showResendOption,
    ],
  );

  useEffect(() => {
    if (mode === "forgot" || authToggleWidth <= 0) return;
    const toValue = mode === "signup" ? authToggleWidth / 2 : 0;
    authToggleTranslateX.value = withTiming(toValue, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [authToggleTranslateX, authToggleWidth, mode]);

  const authToggleIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: authToggleTranslateX.value }],
  }));

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

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          {mode === "forgot" ? (
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {headline}
            </Text>
          ) : (
            <View
              style={[
                styles.authToggleContainer,
                { borderColor: theme.primary },
              ]}
              accessibilityRole="tablist"
              onLayout={(e) => setAuthToggleWidth(e.nativeEvent.layout.width)}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.authToggleIndicator,
                  {
                    backgroundColor: theme.primary,
                    width: authToggleWidth > 0 ? authToggleWidth / 2 : "50%",
                  },
                  authToggleIndicatorStyle,
                ]}
              />
              <Pressable
                onPress={() => switchAuthMode("login")}
                disabled={isLoading}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "login" }}
                style={styles.authToggleOption}
              >
                <Text
                  style={[
                    styles.authToggleText,
                    { color: mode === "login" ? "#fff" : theme.primary },
                  ]}
                >
                  Sign in
                </Text>
              </Pressable>
              <Pressable
                onPress={() => switchAuthMode("signup")}
                disabled={isLoading}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "signup" }}
                style={styles.authToggleOption}
              >
                <Text
                  style={[
                    styles.authToggleText,
                    { color: mode === "signup" ? "#fff" : theme.primary },
                  ]}
                >
                  Sign up
                </Text>
              </Pressable>
            </View>
          )}
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
                  I agree to the{" "}
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
                  . I understand there is zero tolerance for objectionable
                  content or abusive users.
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
                disabled={loadingState.resend || isEmailRequestCooldownActive}
                style={styles.resendButton}
              >
                {loadingState.resend ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Text
                    style={[styles.resendButtonText, { color: theme.primary }]}
                  >
                    {isEmailRequestCooldownActive
                      ? `Resend Email (${emailRequestCooldownSecondsRemaining}s)`
                      : "Resend Email"}
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: theme.primary },
              isPrimaryButtonDisabled && styles.disabledButton,
            ]}
            disabled={isPrimaryButtonDisabled}
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
                {isPrimaryEmailRequestMode && isEmailRequestCooldownActive
                  ? `Wait ${emailRequestCooldownSecondsRemaining}s`
                  : mode === "login"
                    ? "Log In"
                    : mode === "signup"
                      ? "Create account"
                      : "Send Reset Link"}
              </Text>
            )}
          </Pressable>

          {isEmailRequestCooldownActive && (
            <Text
              style={[styles.emailCooldownText, { color: theme.secondaryText }]}
            >
              You can request another email in{" "}
              {emailRequestCooldownSecondsRemaining}s.
            </Text>
          )}

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
                    switchAuthMode(nextMode);
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
        <Text style={[styles.disclaimer, { color: theme.secondaryText }]}>
          UniTee is an independent student project and is not affiliated with,
          endorsed by, or an official product of Nazarbayev University.
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
    width: scale(72),
    height: verticalScale(72),
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: verticalScale(26) },
    shadowOpacity: 0.08,
    shadowRadius: BORDER_RADIUS.xxl,
    elevation: 4,
  },
  cardTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    textAlign: "center",
  },
  authToggleContainer: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    alignSelf: "center",
    position: "relative",
  },
  authToggleIndicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
  },
  authToggleOption: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  authToggleText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
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
    marginTop: verticalScale(2),
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
    minHeight: verticalScale(52),
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
  emailCooldownText: {
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: moderateScale(6),
  },
  switchButton: {
    paddingVertical: verticalScale(2),
    paddingHorizontal: SPACING.xs,
  },
  switchText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
  },
  linkText: {
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  disclaimer: {
    fontSize: moderateScale(11),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    lineHeight: moderateScale(16),
  },
});
