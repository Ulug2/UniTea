import { useState, useEffect } from "react";
import {
  View,
  Text,
  Alert,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import CustomInput from "../../components/CustomInput";
import { useTheme } from "../../context/ThemeContext";

export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const { theme } = useTheme();

  // With PKCE flow (flowType: 'pkce'), {{ .ConfirmationURL }} redirects to:
  // myunitea://reset-password?code=XXXX
  // We exchange that code for a recovery session before showing the form.
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();
  // useLocalSearchParams can return string | string[] — normalise to string | undefined
  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;

  // Exchange the PKCE code for a recovery session on mount
  useEffect(() => {
    async function verifyToken() {
      if (!code) {
        // No code — user navigated here directly with no valid link
        setVerifying(false);
        return;
      }
      try {
        // exchangeCodeForSession fires a PASSWORD_RECOVERY auth event,
        // which AuthContext catches but does NOT set session, so the
        // auth layout won't redirect away from this screen.
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        setVerified(!error);
      } catch {
        setVerified(false);
      } finally {
        setVerifying(false);
      }
    }
    verifyToken();
  }, [code]);

  async function handleResetPassword() {
    setPasswordError("");

    if (!newPassword.trim()) {
      setPasswordError("Please enter a new password.");
      return;
    }
    if (!confirmPassword.trim()) {
      setPasswordError("Please confirm your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        setPasswordError(error.message || "Failed to update password.");
      } else {
        // Sign out so the recovery session doesn't linger
        await supabase.auth.signOut();
        Alert.alert(
          "Password Updated",
          "Your password has been successfully reset. Please sign in.",
          [{ text: "Sign In", onPress: () => router.replace("/(auth)") }],
        );
      }
    } catch {
      setPasswordError("Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (verifying) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} size="large" />
        <Text
          style={[
            styles.subtitle,
            { color: theme.secondaryText, marginTop: 16 },
          ]}
        >
          Verifying your link…
        </Text>
      </View>
    );
  }

  if (!verified) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Link Expired</Text>
        <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
          This password reset link is invalid or has expired. Please request a
          new one.
        </Text>
        <Pressable
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={() => router.replace("/(auth)")}
        >
          <Text style={styles.buttonText}>Back to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Create New Password
      </Text>
      <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
        Enter your new password below
      </Text>

      <CustomInput
        label="New Password"
        leftIcon={{ type: "font-awesome", name: "lock" }}
        onChangeText={setNewPassword}
        value={newPassword}
        secureTextEntry
        placeholder="Enter new password"
        autoCapitalize="none"
        editable={!loading}
      />

      <CustomInput
        label="Confirm Password"
        leftIcon={{ type: "font-awesome", name: "lock" }}
        onChangeText={setConfirmPassword}
        value={confirmPassword}
        secureTextEntry
        placeholder="Confirm new password"
        autoCapitalize="none"
        errorMessage={passwordError}
        editable={!loading}
      />
      <Pressable
        style={[
          styles.button,
          { backgroundColor: theme.primary },
          loading && styles.disabledButton,
        ]}
        disabled={loading}
        onPress={handleResetPassword}
      >
        <Text style={styles.buttonText}>
          {loading ? "Updating..." : "Reset Password"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 32,
    textAlign: "center",
  },
  button: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.65,
  },
});
