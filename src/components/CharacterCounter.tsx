import React from "react";
import { StyleSheet, Text } from "react-native";
import { moderateScale } from "../utils/scaling";

type CharacterCounterProps = {
  current: number;
  max: number;
  color: string;
  warningColor?: string;
};

function CharacterCounter({
  current,
  max,
  color,
  warningColor,
}: CharacterCounterProps) {
  const atLimit = current >= max;

  return (
    <Text
      style={[
        styles.counter,
        { color: atLimit && warningColor ? warningColor : color },
      ]}
    >
      {current} / {max}
    </Text>
  );
}

export default React.memo(CharacterCounter);

const styles = StyleSheet.create({
  counter: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    textAlign: "right",
  },
});
