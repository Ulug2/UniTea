import React from "react";
import {
  Modal,
  Pressable,
  View,
  Image,
  StyleSheet,
} from "react-native";
import SupabaseImage from "../../../components/SupabaseImage";
import { DEFAULT_AVATAR } from "../../../constants/images";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

type AvatarPreviewModalProps = {
  visible: boolean;
  onClose: () => void;
  avatarUrl: string | null;
};

export function AvatarPreviewModal({
  visible,
  onClose,
  avatarUrl,
}: AvatarPreviewModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          {avatarUrl ? (
            avatarUrl.startsWith("http") ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} />
            ) : (
              <SupabaseImage
                path={avatarUrl}
                bucket="avatars"
                style={styles.avatarPreview}
              />
            )
          ) : (
            <Image source={DEFAULT_AVATAR} style={styles.avatarPreview} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPreview: {
    width: scale(220),
    height: verticalScale(220),
    borderRadius: moderateScale(110),
  },
});

