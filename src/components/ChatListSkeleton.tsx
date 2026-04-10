import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

export default function ChatListSkeleton() {
  const { theme } = useTheme();

  const skeletonItems = [1, 2, 3, 4, 5];

  const styles = StyleSheet.create({
    container: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      backgroundColor: theme.card,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatar: {
      width: scale(56),
      height: verticalScale(56),
      borderRadius: moderateScale(28),
      backgroundColor: theme.border,
    },
    content: {
      flex: 1,
      marginLeft: scale(14),
    },
    titleBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: verticalScale(8),
    },
    title: {
      width: scale(120),
      height: verticalScale(16),
      borderRadius: moderateScale(8),
      backgroundColor: theme.border,
    },
    time: {
      width: scale(50),
      height: verticalScale(12),
      borderRadius: moderateScale(6),
      backgroundColor: theme.border,
    },
    message: {
      width: "80%",
      height: verticalScale(14),
      borderRadius: moderateScale(7),
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
