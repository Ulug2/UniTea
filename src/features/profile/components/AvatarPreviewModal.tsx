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
import { PinchToZoom } from "../../../components/PinchToZoom";
import { getAvatarForEntity } from "../../../utils/entityDisplay";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import { FOUNDING_FATHER_BADGE } from "../../../constants/images";

type AvatarPreviewModalProps = {
  visible: boolean;
  onClose: () => void;
  avatarUrl: string | null;
  /** Cache-busting token for a deterministic path overwritten in place — see SupabaseImage. */
  version?: string | null;
  showBadge?: boolean;
};

export function AvatarPreviewModal({
  visible,
  onClose,
  avatarUrl,
  version,
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
          <PinchToZoom style={styles.avatarPreviewWrap}>
            {showBadge ? (
              <Image
                source={FOUNDING_FATHER_BADGE}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : avatarUrl ? (
              avatarUrl.startsWith("http") ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <SupabaseImage
                  path={avatarUrl}
                  bucket="avatars"
                  version={version}
                  style={styles.avatarImage}
                />
              )
            ) : (
              <EntityAvatar
                descriptor={getAvatarForEntity("student", {})}
                style={styles.avatarImage}
              />
            )}
          </PinchToZoom>
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
  avatarPreviewWrap: {
    width: scale(220),
    height: verticalScale(220),
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: moderateScale(110),
  },
});
