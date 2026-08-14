import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

// Widths approximate the real bar's first few pills — "Discover", "Campus
// Feed", then a couple of community-name pills — so the swap-in doesn't
// visibly reflow.
const PILL_WIDTHS = [90, 110, 70, 130, 85];

export default function CommunityFilterBarSkeleton() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: theme.border }]}>
      <View style={styles.row}>
        {PILL_WIDTHS.map((width, index) => (
          <View
            key={index}
            style={[styles.pill, { width: scale(width), backgroundColor: theme.border }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    gap: moderateScale(8),
  },
  pill: {
    height: verticalScale(30),
    borderRadius: moderateScale(999),
  },
});
