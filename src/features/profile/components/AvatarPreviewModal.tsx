import React from "react";
import {
  Modal,
  Pressable,
  View,
  Image,
  StyleSheet,
} from "react-native";
import SupabaseImage from "../../../components/SupabaseImage";
import EntityAvatar from "../../../components/EntityAvatar";
import { getAvatarForEntity } from "../../../utils/entityDisplay";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import { FOUNDING_FATHER_BADGE } from "../../../constants/images";

type AvatarPreviewModalProps = {
  visible: boolean;
  onClose: () => void;
  avatarUrl: string | null;
  showBadge?: boolean;
};

export function AvatarPreviewModal({
  visible,
  onClose,
  avatarUrl,
  showBadge = false,
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
          {showBadge ? (
            <Image
              source={FOUNDING_FATHER_BADGE}
              style={styles.avatarPreview}
              resizeMode="cover"
            />
          ) : avatarUrl ? (
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
            <EntityAvatar
              descriptor={getAvatarForEntity("student", {})}
              style={styles.avatarPreview}
            />
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
