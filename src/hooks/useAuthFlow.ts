import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";
import { normalizeAuthError } from "../utils/authErrors";
import { useRateLimit } from "./useRateLimit";
import { useTimeoutRace } from "./useTimeoutRace";
import { useSplashDuring } from "./useSplashDuring";

type Mode = "login" | "signup" | "forgot";

type LoadingState = {
  login: boolean;
  signup: boolean;
  forgot: boolean;
  resend: boolean;
};

export type UseAuthFlowConfig = {
  timeoutMs: number;
  rateLimitCooldownMs: number;
  minPasswordLength: number;
};

export function useAuthFlow(config: UseAuthFlowConfig) {
  const { timeoutMs, rateLimitCooldownMs, minPasswordLength } = config;
  const { race } = useTimeoutRace();
  const splash = useSplashDuring();
  const rateLimit = useRateLimit({ cooldownMs: rateLimitCooldownMs });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [privacyError, setPrivacyError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showResendOption, setShowResendOption] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    login: false,
    signup: false,
    forgot: false,
    resend: false,
  });

  const isLoading =
    loadingState.login ||
    loadingState.signup ||
    loadingState.forgot ||
    loadingState.resend;

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

  const sanitizeEmail = useCallback((value: string): string => {
    return value.trim().toLowerCase();
  }, []);

  const isAllowedDomain = useCallback((sanitizedEmail: string): boolean => {
    return sanitizedEmail.endsWith("@nu.edu.kz");
  }, []);

  const logAuthEvent = useCallback(
    (event: string, details?: Record<string, unknown>) => {
      logger.breadcrumb(event, "auth", details);
    },
    []
  );

  const checkRateLimitOrAlert = useCallback((): boolean => {
    if (!rateLimit.isLimited) return true;
    Alert.alert(
      "Too Many Attempts",
      `Please wait ${rateLimit.remainingMinutes} minute${
        rateLimit.remainingMinutes > 1 ? "s" : ""
      } before trying again.`
    );
    logAuthEvent("rate_limit_hit", { remainingMinutes: rateLimit.remainingMinutes });
    return false;
  }, [rateLimit.isLimited, rateLimit.remainingMinutes, logAuthEvent]);

  const applyAuthError = useCallback(
    (err: unknown): { message: string; kind: ReturnType<typeof normalizeAuthError>["kind"] } => {
      const normalized = normalizeAuthError(err);

      if (normalized.kind === "rate_limit") {
        rateLimit.trigger();
        logAuthEvent("rate_limit_triggered");
      }
      if (normalized.kind === "email_not_confirmed") {
        setShowResendOption(true);
      }

      if (normalized.kind === "unknown") {
        logAuthEvent("unknown_error", { message: normalized.rawMessage });
      }

      return { message: normalized.message, kind: normalized.kind };
    },
    [rateLimit, logAuthEvent]
  );

  const resendVerificationEmail = useCallback(async () => {
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      Alert.alert("Email Required", "Please enter your email address.");
      return;
    }
    if (!checkRateLimitOrAlert()) return;

    setLoadingState((prev) => ({ ...prev, resend: true }));
    logAuthEvent("resend_verification_started", { email: sanitizedEmail });
    try {
      const { error } = await race(
        supabase.auth.resend({
          type: "signup",
          email: sanitizedEmail,
          options: { emailRedirectTo: "myunitea://callback" },
        }),
        timeoutMs
      );

      if (error) {
        logAuthEvent("resend_verification_failed", { error: error.message });
        Alert.alert("Error", applyAuthError(error).message);
        return;
      }

      logAuthEvent("resend_verification_success");
      Alert.alert("Email Sent", "Please check your inbox for the verification link.");
      setShowResendOption(false);
    } catch (err: unknown) {
      const normalized = normalizeAuthError(err);
      logAuthEvent("resend_verification_error", { error: normalized.rawMessage });
      Alert.alert(
        normalized.kind === "timeout" ? "Timeout" : "Connection Error",
        normalized.kind === "timeout"
          ? "Request timed out. Please try again."
          : "Unable to send email. Please check your connection."
      );
    } finally {
      setLoadingState((prev) => ({ ...prev, resend: false }));
    }
  }, [
    email,
    sanitizeEmail,
    checkRateLimitOrAlert,
    logAuthEvent,
    race,
    timeoutMs,
    applyAuthError,
  ]);

  const resetPassword = useCallback(async () => {
    setEmailError("");
    setPasswordError("");

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setEmailError("Please enter your email address.");
      return;
    }
    if (!checkRateLimitOrAlert()) return;

    setLoadingState((prev) => ({ ...prev, forgot: true }));
    logAuthEvent("password_reset_started", { email: sanitizedEmail });
    try {
      const { error } = await race(
        supabase.auth.resetPasswordForEmail(sanitizedEmail, {
          redirectTo: "myunitea://reset-password",
        }),
        timeoutMs
      );

      if (error) {
        logAuthEvent("password_reset_failed", { error: error.message });
        setEmailError(applyAuthError(error).message);
        return;
      }

      logAuthEvent("password_reset_success");
      Alert.alert(
        "Check Your Email",
        "We sent you a password reset link. Please check your inbox."
      );
      setMode("login");
    } catch (err: unknown) {
      const normalized = normalizeAuthError(err);
      logAuthEvent("password_reset_error", { error: normalized.rawMessage });
      Alert.alert(
        normalized.kind === "timeout" ? "Timeout" : "Connection Error",
        normalized.kind === "timeout"
          ? "Request timed out. Please try again."
          : "Unable to connect. Please check your internet connection and try again."
      );
    } finally {
      setLoadingState((prev) => ({ ...prev, forgot: false }));
    }
  }, [
    email,
    sanitizeEmail,
    checkRateLimitOrAlert,
    logAuthEvent,
    race,
    timeoutMs,
    applyAuthError,
  ]);

  const signInWithEmail = useCallback(async () => {
    setEmailError("");
    setPasswordError("");
    setShowResendOption(false);

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setEmailError("Please enter your email address.");
      return;
    }
    if (!password) {
      setPasswordError("Please enter your password.");
      return;
    }
    if (!checkRateLimitOrAlert()) return;

    setLoadingState((prev) => ({ ...prev, login: true }));
    logAuthEvent("login_started", { email: sanitizedEmail });

    try {
      await splash.run(async () => {
        const { error } = await race(
          supabase.auth.signInWithPassword({
            email: sanitizedEmail,
            password,
          }),
          timeoutMs
        );

        if (error) {
          logAuthEvent("login_failed", { error: error.message });
          const { message, kind } = applyAuthError(error);
          if (
            kind === "invalid_email" ||
            kind === "email_not_confirmed" ||
            message.toLowerCase().includes("verify")
          ) {
            setEmailError(message);
          } else {
            setPasswordError(message);
          }
          throw error; // ensure splash hides
        }

        logAuthEvent("login_success");
        // Keep splash visible; root layout will hide it after prefetch.
        return;
      });
    } catch (err: unknown) {
      const normalized = normalizeAuthError(err);
      logAuthEvent("login_error", { error: normalized.rawMessage });
      if (normalized.kind === "timeout") {
        Alert.alert("Timeout", "Request timed out. Please try again.");
      } else if (normalized.kind === "network") {
        Alert.alert(
          "Connection Error",
          "Unable to connect. Please check your internet connection and try again."
        );
      }
    } finally {
      setLoadingState((prev) => ({ ...prev, login: false }));
    }
  }, [
    email,
    password,
    sanitizeEmail,
    checkRateLimitOrAlert,
    logAuthEvent,
    splash,
    race,
    timeoutMs,
    applyAuthError,
  ]);

  const signUpWithEmail = useCallback(async () => {
    setEmailError("");
    setPasswordError("");
    setShowResendOption(false);
    setPrivacyError("");

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      setEmailError("Please enter your email address.");
      return;
    }
    if (!isAllowedDomain(sanitizedEmail)) {
      setEmailError("Only @nu.edu.kz email addresses are allowed.");
      return;
    }
    if (!password) {
      setPasswordError("Please enter your password.");
      return;
    }
    if (!privacyAccepted) {
      setPrivacyError(
        "Please agree to the collection of your personal data and the Privacy Policy."
      );
      return;
    }
    if (password.length < minPasswordLength) {
      setPasswordError(`Password must be at least ${minPasswordLength} characters long.`);
      return;
    }
    if (!checkRateLimitOrAlert()) return;

    setLoadingState((prev) => ({ ...prev, signup: true }));
    logAuthEvent("signup_started", { email: sanitizedEmail });

    try {
      await splash.run(async () => {
        // Best-effort check; if it fails we proceed and rely on Supabase error.
        try {
          const { data: checkData } = await supabase.functions.invoke(
            "check-email-exists",
            { body: { email: sanitizedEmail } }
          );
          if (checkData?.exists === true) {
            Alert.alert(
              "User already exists",
              "An account with this email already exists. Please sign in instead."
            );
            throw new Error("user_already_registered");
          }
        } catch {
          // ignore
        }

        const { data, error } = await race(
          supabase.auth.signUp({
            email: sanitizedEmail,
            password,
            options: { emailRedirectTo: "myunitea://callback" },
          }),
          timeoutMs
        );

        if (error) {
          logAuthEvent("signup_failed", { error: error.message });
          const { message } = applyAuthError(error);
          if (message.toLowerCase().includes("already exists")) {
            Alert.alert(
              "User already exists",
              "An account with this email already exists. Please sign in instead."
            );
          }
          if (message.toLowerCase().includes("email") || message.toLowerCase().includes("account")) {
            setEmailError(message);
          } else {
            setPasswordError(message);
          }
          throw error;
        }

        if (!data.session) {
          logAuthEvent("signup_success_verification_required");
          Alert.alert(
            "Verify Your Email",
            "Please check your inbox for email verification!"
          );
          setShowResendOption(true);
          return;
        }

        logAuthEvent("signup_success");
      });
    } catch (err: unknown) {
      const normalized = normalizeAuthError(err);
      logAuthEvent("signup_error", { error: normalized.rawMessage });
      if (normalized.kind === "timeout") {
        Alert.alert("Timeout", "Request timed out. Please try again.");
      } else if (normalized.kind === "network") {
        Alert.alert(
          "Connection Error",
          "Unable to connect. Please check your internet connection and try again."
        );
      } else if (normalized.rawMessage === "user_already_registered") {
        // already alerted
      }
    } finally {
      setLoadingState((prev) => ({ ...prev, signup: false }));
    }
  }, [
    email,
    password,
    privacyAccepted,
    minPasswordLength,
    sanitizeEmail,
    isAllowedDomain,
    checkRateLimitOrAlert,
    logAuthEvent,
    splash,
    race,
    timeoutMs,
    applyAuthError,
  ]);

  const setModeAndReset = useCallback((nextMode: Mode) => {
    setMode(nextMode);
    setShowResendOption(false);
    setEmailError("");
    setPasswordError("");
    if (nextMode !== "signup") {
      setPrivacyAccepted(false);
      setPrivacyError("");
    }
  }, []);

  return {
    // state
    email,
    setEmail,
    password,
    setPassword,
    mode,
    setMode: setModeAndReset,
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
    dismissResendOption: () => setShowResendOption(false),
    loadingState,
    isLoading,
    headline,
    helper,

    // actions
    resendVerificationEmail,
    resetPassword,
    signInWithEmail,
    signUpWithEmail,
  };
}

