import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { logger } from "../utils/logger";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

type ModalState = "confirm" | "loading" | "sent";

// This modal is only ever opened from the authenticated profile screen
// (Manage Account -> Forgot Password), never from the logged-out login
// screen — that flow (mode: "forgot" in useAuthFlow.ts) is separate and
// necessarily asks for an email since there's no session yet there. Here,
// the account's own session email is used internally to send the reset
// link but is never rendered anywhere in this UI.
export default function ForgotPasswordModal({
  visible,
  onClose,
}: ForgotPasswordModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [modalState, setModalState] = useState<ModalState>("confirm");
  const [errorMessage, setErrorMessage] = useState("");

  // Reset to a fresh state each time the modal is opened.
  useEffect(() => {
    if (visible) {
      setModalState("confirm");
      setErrorMessage("");
    }
  }, [visible]);

  const handleSend = async () => {
    const accountEmail = session?.user?.email;
    if (!accountEmail) {
      setErrorMessage("Could not find your account email. Please try again later.");
      return;
    }

    setErrorMessage("");
    setModalState("loading");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        accountEmail,
        { redirectTo: "https://unitea.app/reset-password" },
      );

      if (error) {
        logger.error("[ForgotPasswordModal] resetPasswordForEmail failed", error as Error);
        setErrorMessage(error.message ?? "Could not send reset email. Please try again.");
        setModalState("confirm");
        return;
      }

      setModalState("sent");
    } catch (err) {
      logger.error("[ForgotPasswordModal] Unexpected error", err as Error);
      setErrorMessage("Could not send reset email. Please try again.");
      setModalState("confirm");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: theme.card,
              paddingBottom: Math.max(insets.bottom, verticalScale(32)),
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View
            style={[styles.modalHandle, { backgroundColor: theme.border }]}
          />

          {modalState === "sent" ? (
            <>
              <View style={styles.iconWrap}>
                <Ionicons
                  name="mail-outline"
                  size={moderateScale(40)}
                  color={theme.primary}
                />
              </View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Check Your Email
              </Text>
              <Text
                style={[styles.subtitle, { color: theme.secondaryText }]}
              >
                We sent a password reset link to your registered email
                address. Tap it to set a new password. The link expires
                after 1 hour.
              </Text>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
                onPress={onClose}
              >
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Reset Password
              </Text>
              <Text
                style={[styles.subtitle, { color: theme.secondaryText }]}
              >
                We'll send a password reset link to your account's
                registered email address.
              </Text>

              {!!errorMessage && (
                <Text style={styles.errorText}>{errorMessage}</Text>
              )}

              <Pressable
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.primary },
                  modalState === "loading" && styles.disabledButton,
                ]}
                onPress={handleSend}
                disabled={modalState === "loading"}
              >
                {modalState === "loading" ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(32),
    paddingHorizontal: scale(20),
  },
  modalHandle: {
    width: scale(40),
    height: verticalScale(4),
    borderRadius: moderateScale(2),
    alignSelf: "center",
    marginBottom: verticalScale(16),
  },
  iconWrap: {
    alignItems: "center",
    marginBottom: verticalScale(4),
  },
  modalTitle: {
    fontSize: moderateScale(20),
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    marginBottom: verticalScale(8),
  },
  subtitle: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: moderateScale(20),
    marginBottom: verticalScale(20),
  },
  primaryButton: {
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
  errorText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_400Regular",
    color: "#EF4444",
    textAlign: "center",
    marginTop: verticalScale(-8),
    marginBottom: verticalScale(16),
  },
});
