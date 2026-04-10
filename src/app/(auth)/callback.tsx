import { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { moderateScale, scale, verticalScale } from "../../utils/scaling";

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
      if (params.error || params.error_code) {
        const description =
          (params.error_description as string | undefined) ||
          (params.error_code as string | undefined) ||
          "The verification link is invalid or has expired.";
        logger.error("[Email Callback] Auth error", undefined, { description });
        setStatus("error");
        setMessage(description);
        return;
      }

      const code = params.code as string | undefined;
      if (code) {
        try {
          const { data, error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (data?.session) {
            logger.info(
              "[Email Callback] Email verified successfully via code",
            );
            router.replace("/(protected)/(tabs)");
          } else if (error) {
            logger.error(
              "[Email Callback] Error exchanging code",
              error as Error,
            );
            setStatus("error");
            setMessage(
              "We couldn't complete email verification. Please try again or request a new link.",
            );
          } else {
            logger.error(
              "[Email Callback] No session returned from exchangeCodeForSession",
            );
            setStatus("error");
            setMessage(
              "We couldn't complete email verification. Please try again or request a new link.",
            );
          }
        } catch (err: any) {
          logger.error(
            "[Email Callback] Unexpected error (code)",
            err as Error,
          );
          setStatus("error");
          setMessage(
            "Unexpected error during verification. Please try again later.",
          );
        }
        return;
      }

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

        if (data?.session) {
          logger.info("[Email Callback] Email verified successfully");
          router.replace("/(protected)/(tabs)");
        } else if (error) {
          logger.error(
            "[Email Callback] Error setting session",
            error as Error,
          );
          setStatus("error");
          setMessage(
            "We couldn't complete email verification. Please try again or request a new link.",
          );
        } else {
          logger.error("[Email Callback] No session returned from setSession");
          setStatus("error");
          setMessage(
            "We couldn't complete email verification. Please try again or request a new link.",
          );
        }
      } catch (err: any) {
        logger.error("[Email Callback] Unexpected error", err as Error);
        setStatus("error");
        setMessage(
          "Unexpected error during verification. Please try again later.",
        );
      }
    };

    handleCallback();
  }, [params]);

  if (status === "verifying") {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.title}>Signing you in…</Text>
        <Text style={styles.subtitle}>Please wait a moment.</Text>
      </View>
    );
  }

  // Error state (no alerts; inline message + Back to sign in)
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Email link problem</Text>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable
        style={styles.backButton}
        onPress={() => router.replace("/(auth)")}
      >
        <Text style={styles.backButtonText}>Back to sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: moderateScale(24),
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: "600",
    marginTop: verticalScale(16),
    textAlign: "center",
  },
  subtitle: {
    fontSize: moderateScale(14),
    marginTop: verticalScale(8),
    textAlign: "center",
    color: "#666",
  },
  errorText: {
    fontSize: moderateScale(14),
    marginTop: verticalScale(12),
    textAlign: "center",
    color: "#E53935",
  },
  backButton: {
    marginTop: verticalScale(24),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(24),
    borderRadius: moderateScale(8),
    backgroundColor: "#2FC9C1",
  },
  backButtonText: {
    color: "#fff",
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
});
