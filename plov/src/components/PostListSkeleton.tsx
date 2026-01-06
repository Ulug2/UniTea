import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

export default function PostListSkeleton() {
  const { theme } = useTheme();

  const skeletonItems = [1, 2, 3];

  const styles = StyleSheet.create({
    postCard: {
      padding: 16,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 12,
    },
    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.border,
    },
    userInfo: {
      flex: 1,
      gap: 6,
    },
    username: {
      width: 120,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.border,
    },
    timestamp: {
      width: 80,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.border,
    },
    // Content
    contentLine: {
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.border,
      marginBottom: 6,
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
      height: 200,
      borderRadius: 12,
      backgroundColor: theme.border,
      marginTop: 8,
    },
    // Footer
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
      marginTop: 8,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    icon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.border,
    },
    count: {
      width: 30,
      height: 14,
      borderRadius: 7,
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

