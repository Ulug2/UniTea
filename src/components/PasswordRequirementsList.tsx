import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, verticalScale } from "../utils/scaling";
import {
  getPasswordRequirements,
  type PasswordRequirement,
} from "../utils/passwordValidation";

type Props = {
  password: string;
  confirmPassword?: string;
  checkMatch?: boolean;
};

export default function PasswordRequirementsList({
  password,
  confirmPassword,
  checkMatch,
}: Props) {
  const { theme } = useTheme();
  const requirements = getPasswordRequirements(password, {
    confirmPassword,
    checkMatch,
  });

  // Nothing typed yet — don't show a wall of red X's before the user starts.
  if (password.length === 0) return null;

  return (
    <View style={styles.container}>
      {requirements.map((req: PasswordRequirement) => (
        <View key={req.key} style={styles.row}>
          <Ionicons
            name={req.met ? "checkmark-circle" : "close-circle"}
            size={moderateScale(14)}
            color={req.met ? theme.primary : theme.error}
          />
          <Text
            style={[
              styles.label,
              { color: req.met ? theme.secondaryText : theme.error },
            ]}
          >
            {req.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: verticalScale(-6),
    marginBottom: verticalScale(12),
    gap: verticalScale(4),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(6),
  },
  label: {
    fontSize: moderateScale(12.5),
    fontFamily: "Poppins_400Regular",
  },
});
