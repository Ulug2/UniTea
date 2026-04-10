import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

export default function LostFoundListSkeleton() {
  const { theme } = useTheme();

  const skeletonItems = [1, 2, 3];

  const styles = StyleSheet.create({
    card: {
      backgroundColor: theme.card,
      borderRadius: moderateScale(16),
      padding: moderateScale(16),
      marginBottom: verticalScale(16),
      gap: moderateScale(12),
      borderWidth: 1,
      borderColor: theme.border,
    },
    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: moderateScale(12),
    },
    avatar: {
      width: scale(40),
      height: verticalScale(40),
      borderRadius: moderateScale(20),
      backgroundColor: theme.border,
    },
    userInfo: {
      flex: 1,
      gap: moderateScale(6),
    },
    username: {
      width: scale(100),
      height: verticalScale(14),
      borderRadius: moderateScale(7),
      backgroundColor: theme.border,
    },
    timestamp: {
      width: scale(70),
      height: verticalScale(12),
      borderRadius: moderateScale(6),
      backgroundColor: theme.border,
    },
    // Badge
    badge: {
      width: scale(60),
      height: verticalScale(24),
      borderRadius: moderateScale(12),
      backgroundColor: theme.border,
    },
    // Image placeholder
    imagePlaceholder: {
      width: "100%",
      height: verticalScale(180),
      borderRadius: moderateScale(12),
      backgroundColor: theme.border,
    },
    // Content
    contentLine: {
      height: verticalScale(14),
      borderRadius: moderateScale(7),
      backgroundColor: theme.border,
      marginBottom: verticalScale(6),
    },
    contentLineLong: {
      width: "100%",
    },
    contentLineMedium: {
      width: "75%",
    },
    // Tags
    tagsRow: {
      flexDirection: "row",
      gap: moderateScale(8),
      marginTop: verticalScale(4),
    },
    tag: {
      width: scale(60),
      height: verticalScale(24),
      borderRadius: moderateScale(12),
      backgroundColor: theme.border,
    },
    tagWide: {
      width: scale(80),
    },
    // Footer
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: verticalScale(8),
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: moderateScale(6),
    },
    icon: {
      width: scale(16),
      height: verticalScale(16),
      borderRadius: moderateScale(8),
      backgroundColor: theme.border,
    },
    location: {
      width: scale(100),
      height: verticalScale(12),
      borderRadius: moderateScale(6),
      backgroundColor: theme.border,
    },
    chatButton: {
      width: scale(80),
      height: verticalScale(36),
      borderRadius: moderateScale(18),
      backgroundColor: theme.border,
    },
  });

  return (
    <>
      {skeletonItems.map((item, index) => (
        <View key={item} style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.avatar} />
            <View style={styles.userInfo}>
              <View style={styles.username} />
              <View style={styles.timestamp} />
            </View>
            <View style={styles.badge} />
          </View>

          {/* Image (show only for first and third items) */}
          {(index === 0 || index === 2) && (
            <View style={styles.imagePlaceholder} />
          )}

          {/* Content */}
          <View>
            <View style={[styles.contentLine, styles.contentLineLong]} />
            <View style={[styles.contentLine, styles.contentLineMedium]} />
          </View>

          {/* Tags */}
          <View style={styles.tagsRow}>
            <View style={styles.tag} />
            <View style={[styles.tag, styles.tagWide]} />
            {index === 1 && <View style={styles.tag} />}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.locationRow}>
              <View style={styles.icon} />
              <View style={styles.location} />
            </View>
            <View style={styles.chatButton} />
          </View>
        </View>
      ))}
    </>
  );
}
