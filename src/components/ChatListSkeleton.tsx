import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

export default function ChatListSkeleton() {
  const { theme } = useTheme();

  const skeletonItems = [1, 2, 3, 4, 5];

  const styles = StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: theme.card,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.border,
    },
    content: {
      flex: 1,
      marginLeft: 14,
    },
    titleBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    title: {
      width: 120,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.border,
    },
    time: {
      width: 50,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.border,
    },
    message: {
      width: "80%",
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.border,
    },
  });

  return (
    <>
      {skeletonItems.map((item) => (
        <View key={item} style={styles.container}>
          <View style={styles.row}>
            <View style={styles.avatar} />
            <View style={styles.content}>
              <View style={styles.titleBar}>
                <View style={styles.title} />
                <View style={styles.time} />
              </View>
              <View style={styles.message} />
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

