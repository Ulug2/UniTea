import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";

export default function EmailCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();

  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const handleCallback = async () => {
      // If Supabase sent an error (expired / invalid link)
      if (params.error || params.error_code) {
        const description =
          (params.error_description as string | undefined) ||
          (params.error_code as string | undefined) ||
          "The verification link is invalid or has expired.";

        logger.error("[Email Callback] Auth error", undefined, { description });
        setStatus("error");
        setMessage(description);
        Alert.alert("Email link error", description);
        return;
      }

      // Newer Supabase links: ?code=...
      const code = params.code as string | undefined;
      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          // Success if we got a session, even if there's a minor error/warning
          if (data?.session) {
            logger.info("[Email Callback] Email verified successfully via code");
            router.replace("/(protected)/(tabs)");
          } else if (error) {
            // Only show error if we didn't get a session
            logger.error("[Email Callback] Error exchanging code", error as Error);
            setStatus("error");
            setMessage(
              "We couldn't complete email verification. Please try again or request a new link."
            );
            Alert.alert(
              "Verification failed",
              "We couldn't verify your email. Please try again or request a new link."
            );
          } else {
            // No session and no error - unexpected state
            logger.error("[Email Callback] No session returned from exchangeCodeForSession");
            setStatus("error");
            setMessage(
              "We couldn't complete email verification. Please try again or request a new link."
            );
            Alert.alert(
              "Verification failed",
              "We couldn't verify your email. Please try again or request a new link."
            );
          }
        } catch (err: any) {
          logger.error("[Email Callback] Unexpected error (code)", err as Error);
          setStatus("error");
          setMessage(
            "Unexpected error during verification. Please try again later."
          );
          Alert.alert(
            "Verification error",
            "Unexpected error during verification. Please try again later."
          );
        }
        return;
      }

      // Fallback: older style links with access_token + refresh_token
      const accessToken = params.access_token as string | undefined;
      const refreshToken = params.refresh_token as string | undefined;

      if (!accessToken || !refreshToken) {
        setStatus("error");
        setMessage("Missing token information in the verification link.");
        return;
      }

      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        // Success if we got a session, even if there's a minor error/warning
        if (data?.session) {
          logger.info("[Email Callback] Email verified successfully");
          // Navigate into the app; root layout will load user/session
          router.replace("/(protected)/(tabs)");
        } else if (error) {
          // Only show error if we didn't get a session
          logger.error("[Email Callback] Error setting session", error as Error);
          setStatus("error");
          setMessage(
            "We couldn't complete email verification. Please try again or request a new link."
          );
          Alert.alert(
            "Verification failed",
            "We couldn't verify your email. Please try again or request a new link."
          );
        } else {
          // No session and no error - unexpected state
          logger.error("[Email Callback] No session returned from setSession");
          setStatus("error");
          setMessage(
            "We couldn't complete email verification. Please try again or request a new link."
          );
          Alert.alert(
            "Verification failed",
            "We couldn't verify your email. Please try again or request a new link."
          );
        }
      } catch (err: any) {
        logger.error("[Email Callback] Unexpected error", err as Error);
        setStatus("error");
        setMessage(
          "Unexpected error during verification. Please try again later."
        );
        Alert.alert(
          "Verification error",
          "Unexpected error during verification. Please try again later."
        );
      }
    };

    handleCallback();
  }, [params]);

  if (status === "verifying") {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.title}>Verifying your email…</Text>
        <Text style={styles.subtitle}>
          Please wait while we complete your sign up.
        </Text>
      </View>
    );
  }

  // Error state
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Email link problem</Text>
      <Text style={styles.errorText}>{message}</Text>
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
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    color: "#666",
  },
  errorText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
    color: "#E53935",
  },
});

