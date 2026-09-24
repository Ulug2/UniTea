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

// Supabase verifies the email *before* redirecting here, so any failure after
// the redirect means the account is already verified — only the automatic
// sign-in failed (e.g. link opened on a different device than signup, where
// the PKCE code verifier doesn't exist).
const VERIFIED_SIGN_IN = {
  title: "Email verified",
  message: "Your email is verified. Please sign in to continue.",
  isError: false,
};

// Link rejected by Supabase (already used or expired) or malformed. The email
// may or may not be verified; signing in either succeeds or offers a resend.
const LINK_USED_OR_EXPIRED = {
  title: "Email link problem",
  message:
    "This link has already been used or has expired. If your email is already verified, just sign in. Otherwise, sign in to request a new link.",
  isError: true,
};

type ErrorContent = typeof VERIFIED_SIGN_IN;

export default function EmailCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();

  const [error, setError] = useState<ErrorContent | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      if (params.error || params.error_code) {
        logger.error("[Email Callback] Auth error", undefined, {
          error: params.error,
          errorCode: params.error_code,
          description: params.error_description,
        });
        setError(LINK_USED_OR_EXPIRED);
        return;
      }

      const code = params.code as string | undefined;
      const accessToken = params.access_token as string | undefined;
      const refreshToken = params.refresh_token as string | undefined;

      if (!code && (!accessToken || !refreshToken)) {
        logger.error("[Email Callback] Missing code/token params");
        setError(LINK_USED_OR_EXPIRED);
        return;
      }

      try {
        const { data, error: authError } = code
          ? await supabase.auth.exchangeCodeForSession(code)
          : await supabase.auth.setSession({
              access_token: accessToken!,
              refresh_token: refreshToken!,
            });

        if (data?.session) {
          logger.info("[Email Callback] Email verified successfully");
          router.replace("/(protected)/(tabs)");
          return;
        }
        logger.error(
          "[Email Callback] No session after verification redirect",
          authError ?? undefined,
          { flow: code ? "pkce" : "tokens" },
        );
      } catch (err: unknown) {
        logger.error("[Email Callback] Unexpected error", err);
      }
      setError(VERIFIED_SIGN_IN);
    };

    handleCallback();
  }, [params]);

  if (!error) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.title}>Signing you in…</Text>
        <Text style={styles.subtitle}>Please wait a moment.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{error.title}</Text>
      <Text style={error.isError ? styles.errorText : styles.subtitle}>
        {error.message}
      </Text>
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
