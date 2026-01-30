import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import CustomInput from "./CustomInput";
import { useTheme } from "../context/ThemeContext";
import * as SplashScreen from "expo-splash-screen";
import { hideSplashSafe } from "../utils/splash";
import { logger } from "../utils/logger";

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

type LoadingState = {
  login: boolean;
  signup: boolean;
  forgot: boolean;
  resend: boolean;
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState>({
    login: false,
    signup: false,
    forgot: false,
    resend: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [showResendOption, setShowResendOption] = useState(false);
  const { theme } = useTheme();

  // Notion URLs
  const TERMS_URL =
    "https://www.notion.so/UniTee-Terms-of-Service-2efa8fe2a0c1809d8243e3d0344fa20c?source=copy_link";
  const PRIVACY_URL =
    "https://www.notion.so/UniTee-Privacy-Policy-EN-2efa8fe2a0c180ef8601ed544944df9b?source=copy_link";

  // Helper function to open external links
  const openExternalLink = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Unable to open link", "Please try again later.");
        return;
      }
      await Linking.openURL(url);
    } catch (error: any) {
      Alert.alert(
        "Unable to open link",
        error?.message || "Please try again later.",
      );
    }
  }, []);

  // Timeout refs for cleanup
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Check if currently loading
  const isLoading =
    loadingState.login ||
    loadingState.signup ||
    loadingState.forgot ||
    loadingState.resend;

  // Allow any email domain (NU-only restriction disabled for testing / TestFlight)
  const isUniversityEmail = (_value: string) => true;
  // const isUniversityEmail = (value: string) =>
  //   value.trim().toLowerCase().endsWith('@nu.edu.kz');

  // Email sanitization helper
  const sanitizeEmail = (value: string): string => {
    return value.trim().toLowerCase();
  };

  // Analytics/logging helper
  const logAuthEvent = (event: string, details?: any) => {
    logger.breadcrumb(event, "auth", details);
  };

  // Rate limiting check
  const checkRateLimit = (): boolean => {
    if (rateLimitUntil && Date.now() < rateLimitUntil) {
      const remainingMinutes = Math.ceil((rateLimitUntil - Date.now()) / 60000);
      Alert.alert(
        "Too Many Attempts",
        `Please wait ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""
        } before trying again.`,
      );
      logAuthEvent("rate_limit_hit", { remainingMinutes });
      return false;
    }
    return true;
  };

  // Timeout wrapper for async operations
  const withTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number = AUTH_CONFIG.TIMEOUT_MS,
  ): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutRef.current = setTimeout(() => {
          reject(new Error("Request timeout"));
        }, timeoutMs);
      }),
    ]);
  };

  // Helper function to convert Supabase errors to user-friendly messages
  const getUserFriendlyError = (error: any): string => {
    const message = error?.message?.toLowerCase() || "";

    // Check for rate limiting
    if (message.includes("too many") || message.includes("rate limit")) {
      setRateLimitUntil(Date.now() + AUTH_CONFIG.RATE_LIMIT_COOLDOWN_MS);
      logAuthEvent("rate_limit_triggered");
      return "Too many attempts. Please try again in 5 minutes.";
    }

    if (
      message.includes("invalid login credentials") ||
      message.includes("invalid credentials")
    ) {
      return "Incorrect email or password. Please try again.";
    }
    if (message.includes("email not confirmed")) {
      setShowResendOption(true); // Show resend verification option
      return "Please verify your email address before signing in.";
    }
    if (message.includes("user already registered")) {
      return "An account with this email already exists.";
    }
    if (message.includes("password should be at least")) {
      return "Password must be at least 6 characters long.";
    }
    if (message.includes("invalid email")) {
      return "Please enter a valid email address.";
    }
    if (message.includes("network")) {
      return "Network error. Please check your connection.";
    }
    if (message.includes("timeout")) {
      return "Request timed out. Please check your connection and try again.";
    }

    // Default fallback for unknown errors
    logAuthEvent("unknown_error", { message });
    return "Something went wrong. Please try again.";
  };

  // Resend verification email
  async function resendVerificationEmail() {
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      Alert.alert("Email Required", "Please enter your email address.");
      return;
    }

    if (!checkRateLimit()) return;

    setLoadingState((prev) => ({ ...prev, resend: true }));
    logAuthEvent("resend_verification_started", { email: sanitizedEmail });

    try {
      const { error } = await withTimeout(
        supabase.auth.resend({
          type: "signup",
          email: sanitizedEmail,
          options: {
            // Use /callback route (auth group is not part of URL)
            emailRedirectTo: "myunitea://callback",
          },
        }),
      );

      if (error) {
        logAuthEvent("resend_verification_failed", { error: error.message });
        Alert.alert("Error", getUserFriendlyError(error));
      } else {
        logAuthEvent("resend_verification_success");
        Alert.alert(
          "Email Sent",
          "Please check your inbox for the verification link.",
        );
        setShowResendOption(false);
      }
    } catch (error: any) {
      logAuthEvent("resend_verification_error", { error: error.message });
      if (error.message === "Request timeout") {
        Alert.alert("Timeout", "Request timed out. Please try again.");
      } else {
        Alert.alert(
          "Connection Error",
          "Unable to send email. Please check your connection.",
        );
      }
    } finally {
      setLoadingState((prev) => ({ ...prev, resend: false }));
    }
  }

  async function resetPassword() {
    // Clear previous errors
    setEmailError("");
    setPasswordError("");

    // Validate and sanitize email
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setEmailError("Please enter your email address.");
      return;
    }

    if (!checkRateLimit()) return;

    setLoadingState((prev) => ({ ...prev, forgot: true }));
    logAuthEvent("password_reset_started", { email: sanitizedEmail });

    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(sanitizedEmail, {
          redirectTo: "myunitea://reset-password",
        }),
      );

      if (error) {
        logAuthEvent("password_reset_failed", { error: error.message });
        setEmailError(getUserFriendlyError(error));
      } else {
        logAuthEvent("password_reset_success");
        Alert.alert(
          "Check Your Email",
          "We sent you a password reset link. Please check your inbox.",
        );
        setMode("login");
      }
    } catch (error: any) {
      logAuthEvent("password_reset_error", { error: error.message });
      if (error.message === "Request timeout") {
        Alert.alert("Timeout", "Request timed out. Please try again.");
      } else {
        Alert.alert(
          "Connection Error",
          "Unable to connect. Please check your internet connection and try again.",
        );
      }
    } finally {
      setLoadingState((prev) => ({ ...prev, forgot: false }));
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
  }

  const headline = useMemo(() => {
    if (mode === "forgot") return "Reset Password";
    return mode === "login" ? "Sign in" : "Create your account";
  }, [mode]);

  const helper = useMemo(() => {
    if (mode === "forgot") return "Enter your email to receive a reset link.";
    return mode === "login"
      ? "Sign in to your account."
      : "Join UniTee with your @nu.edu.kz address.";
  }, [mode]);

  async function signInWithEmail() {
    // Clear previous errors
    setEmailError("");
    setPasswordError("");
    setShowResendOption(false);

    // Validate and sanitize email
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setEmailError("Please enter your email address.");
      return;
    }
    if (!password) {
      setPasswordError("Please enter your password.");
      return;
    }

    if (!checkRateLimit()) return;

    setLoadingState((prev) => ({ ...prev, login: true }));
    logAuthEvent("login_started", { email: sanitizedEmail });

    // Show splash screen during login
    try {
      await SplashScreen.preventAutoHideAsync();
    } catch (e) {
      // Ignore errors - splash screen might already be prevented or not available
      logger.warn("[Auth] Could not prevent auto-hide splash", e as Error);
    }

    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: sanitizedEmail,
          password: password,
        }),
      );

      if (error) {
        logAuthEvent("login_failed", { error: error.message });
        const friendlyError = getUserFriendlyError(error);
        // Determine if error is email or password related
        if (
          friendlyError.toLowerCase().includes("email") ||
          friendlyError.toLowerCase().includes("verify")
        ) {
          setEmailError(friendlyError);
        } else {
          setPasswordError(friendlyError);
        }
        // Hide splash screen on error
        await hideSplashSafe();
      } else {
        logAuthEvent("login_success");
        // Keep splash screen visible - root layout will hide it after prefetch
      }
    } catch (error: any) {
      logAuthEvent("login_error", { error: error.message });
      // Hide splash screen on error
      await hideSplashSafe();
      if (error.message === "Request timeout") {
        Alert.alert("Timeout", "Request timed out. Please try again.");
      } else {
        Alert.alert(
          "Connection Error",
          "Unable to connect. Please check your internet connection and try again.",
        );
      }
    } finally {
      setLoadingState((prev) => ({ ...prev, login: false }));
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
  }

  async function signUpWithEmail() {
    // Clear previous errors
    setEmailError("");
    setPasswordError("");
    setShowResendOption(false);
    setPrivacyError("");

    // Validate and sanitize email
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setEmailError("Please enter your email address.");
      return;
    }
    if (!password) {
      setPasswordError("Please enter your password.");
      return;
    }

    if (!privacyAccepted) {
      setPrivacyError(
        "Please agree to the collection of your personal data and the Privacy Policy.",
      );
      return;
    }

    // Password strength validation
    if (password.length < AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
      setPasswordError(
        `Password must be at least ${AUTH_CONFIG.MIN_PASSWORD_LENGTH} characters long.`,
      );
      return;
    }

    // NU-only email restriction disabled for testing (accept any email domain)
    // if (!isUniversityEmail(sanitizedEmail)) {
    //   setEmailError("Sign up with your @nu.edu.kz mailbox to join UniTee.");
    //   return;
    // }
    if (!checkRateLimit()) return;

    setLoadingState((prev) => ({ ...prev, signup: true }));
    logAuthEvent("signup_started", { email: sanitizedEmail });

    // Show splash screen during signup
    try {
      await SplashScreen.preventAutoHideAsync();
    } catch (e) {
      // Ignore errors - splash screen might already be prevented or not available
      logger.warn("[Auth] Could not prevent auto-hide splash", e as Error);
    }

    try {
      const {
        data: { session },
        error,
      } = await withTimeout(
        supabase.auth.signUp({
          email: sanitizedEmail,
          password: password,
          options: {
            // Use /callback route (auth group is not part of URL)
            emailRedirectTo: "myunitea://callback",
          },
        }),
      );

      if (error) {
        logAuthEvent("signup_failed", { error: error.message });
        const friendlyError = getUserFriendlyError(error);

        // If this is a \"user already registered\" type error, show a clear alert
        if (
          friendlyError.toLowerCase().includes("already exists") ||
          friendlyError.toLowerCase().includes("already registered")
        ) {
          Alert.alert(
            "Account already exists",
            "A user with this email is already registered. Please sign in instead."
          );
        }

        // Determine if error is email or password related
        if (
          friendlyError.toLowerCase().includes("email") ||
          friendlyError.toLowerCase().includes("account")
        ) {
          setEmailError(friendlyError);
        } else {
          setPasswordError(friendlyError);
        }
        // Hide splash screen on error
        await hideSplashSafe();
      } else if (!session) {
        logAuthEvent("signup_success_verification_required");
        // Hide splash screen if email verification is required
        await hideSplashSafe();
        Alert.alert(
          "Verify Your Email",
          "Please check your inbox for email verification!",
        );
        setShowResendOption(true);
      } else {
        logAuthEvent("signup_success");
        // Keep splash screen visible - root layout will hide it after prefetch
      }
    } catch (error: any) {
      logAuthEvent("signup_error", { error: error.message });
      // Hide splash screen on error
      await hideSplashSafe();
      if (error.message === "Request timeout") {
        Alert.alert("Timeout", "Request timed out. Please try again.");
      } else {
        Alert.alert(
          "Connection Error",
          "Unable to connect. Please check your internet connection and try again.",
        );
      }
    } finally {
      setLoadingState((prev) => ({ ...prev, signup: false }));
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
  }

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
              if (showResendOption) setShowResendOption(false);
            }}
            value={email}
            placeholder="your.name@nu.edu.kz"
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
                    onPress={() => openExternalLink(PRIVACY_URL)}
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
                  setShowResendOption(false);
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
                    setShowResendOption(false);
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
            onPress={() => openExternalLink(TERMS_URL)}
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={[styles.linkText, { color: theme.primary }]}
            onPress={() => openExternalLink(PRIVACY_URL)}
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
