import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

export default function LostFoundListSkeleton() {
  const { theme } = useTheme();

  const skeletonItems = [1, 2, 3];

  const styles = StyleSheet.create({
    card: {
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.border,
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
      width: 100,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.border,
    },
    timestamp: {
      width: 70,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.border,
    },
    // Badge
    badge: {
      width: 60,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.border,
    },
    // Image placeholder
    imagePlaceholder: {
      width: "100%",
      height: 180,
      borderRadius: 12,
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
      width: "75%",
    },
    // Tags
    tagsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 4,
    },
    tag: {
      width: 60,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.border,
    },
    tagWide: {
      width: 80,
    },
    // Footer
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 8,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    icon: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.border,
    },
    location: {
      width: 100,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.border,
    },
    chatButton: {
      width: 80,
      height: 36,
      borderRadius: 18,
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

