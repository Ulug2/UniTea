import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

export default function CommunityListSkeleton() {
  const { theme } = useTheme();

  const skeletonItems = [1, 2, 3, 4, 5, 6];

  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      padding: moderateScale(12),
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      marginBottom: verticalScale(10),
    },
    avatar: {
      width: scale(48),
      height: scale(48),
      borderRadius: moderateScale(24),
      backgroundColor: theme.border,
    },
    info: {
      flex: 1,
      marginHorizontal: scale(12),
    },
    name: {
      width: scale(120),
      height: verticalScale(15),
      borderRadius: moderateScale(7),
      backgroundColor: theme.border,
    },
    memberCount: {
      width: scale(70),
      height: verticalScale(12),
      borderRadius: moderateScale(6),
      backgroundColor: theme.border,
      marginTop: verticalScale(6),
    },
    description: {
      width: "90%",
      height: verticalScale(12),
      borderRadius: moderateScale(6),
      backgroundColor: theme.border,
      marginTop: verticalScale(6),
    },
    button: {
      width: scale(72),
      height: verticalScale(36),
      borderRadius: moderateScale(999),
      backgroundColor: theme.border,
    },
  });

  return (
    <>
      {skeletonItems.map((item) => (
        <View key={item} style={styles.row}>
          <View style={styles.avatar} />
          <View style={styles.info}>
            <View style={styles.name} />
            <View style={styles.memberCount} />
            <View style={styles.description} />
          </View>
          <View style={styles.button} />
        </View>
      ))}
    </>
  );
}
