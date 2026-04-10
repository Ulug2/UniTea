import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

export default function PostListSkeleton() {
  const { theme } = useTheme();

  const skeletonItems = [1, 2, 3];

  const styles = StyleSheet.create({
    postCard: {
      padding: moderateScale(16),
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: moderateScale(12),
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
      width: scale(120),
      height: verticalScale(16),
      borderRadius: moderateScale(8),
      backgroundColor: theme.border,
    },
    timestamp: {
      width: scale(80),
      height: verticalScale(12),
      borderRadius: moderateScale(6),
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
      width: "85%",
    },
    contentLineShort: {
      width: "60%",
    },
    // Image placeholder (optional)
    imagePlaceholder: {
      width: "100%",
      height: verticalScale(200),
      borderRadius: moderateScale(12),
      backgroundColor: theme.border,
      marginTop: verticalScale(8),
    },
    // Footer
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: moderateScale(20),
      marginTop: verticalScale(8),
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: moderateScale(6),
    },
    icon: {
      width: scale(20),
      height: verticalScale(20),
      borderRadius: moderateScale(10),
      backgroundColor: theme.border,
    },
    count: {
      width: scale(30),
      height: verticalScale(14),
      borderRadius: moderateScale(7),
      backgroundColor: theme.border,
    },
  });

  return (
    <>
      {skeletonItems.map((item, index) => (
        <View key={item} style={styles.postCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.avatar} />
            <View style={styles.userInfo}>
              <View style={styles.username} />
              <View style={styles.timestamp} />
            </View>
          </View>

          {/* Content */}
          <View>
            <View style={[styles.contentLine, styles.contentLineLong]} />
            <View style={[styles.contentLine, styles.contentLineMedium]} />
            {index === 1 && ( // Show short line only for second item
              <View style={[styles.contentLine, styles.contentLineShort]} />
            )}
          </View>

          {/* Image placeholder (show only for first item) */}
          {index === 0 && <View style={styles.imagePlaceholder} />}

          {/* Footer */}
          <View style={styles.footer}>
            {/* Upvote */}
            <View style={styles.actionButton}>
              <View style={styles.icon} />
              <View style={styles.count} />
            </View>
            {/* Comment */}
            <View style={styles.actionButton}>
              <View style={styles.icon} />
              <View style={styles.count} />
            </View>
            {/* Share */}
            <View style={styles.actionButton}>
              <View style={styles.icon} />
            </View>
          </View>
        </View>
      ))}
    </>
  );
}
