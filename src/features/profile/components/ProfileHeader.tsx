import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlippableAvatar } from "./FlippableAvatar";
import { FoundingBadge } from "./FoundingBadge";
import type { Theme } from "../../../context/ThemeContext";
import type { Database } from "../../../types/database.types";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type ProfileHeaderProps = {
  theme: Theme;
  currentUser: Profile | null;
  userDisplayName: string;
  userEmail: string;
  totalVotes: number;
  onAvatarPress: () => void;
};

export function ProfileHeader({
  theme,
  currentUser,
  userDisplayName,
  userEmail,
  totalVotes,
  onAvatarPress,
}: ProfileHeaderProps) {
  return (
    <View style={[styles.userCard, { backgroundColor: theme.card }]}>
      <FlippableAvatar
        currentUser={currentUser}
        onAvatarPress={onAvatarPress}
      />
      <View style={styles.userInfo}>
        <Text style={[styles.userName, { color: theme.text }]}>
          {userDisplayName}
        </Text>
        <Text style={[styles.userEmail, { color: theme.secondaryText }]}>
          {userEmail}
        </Text>
        <View style={styles.upvotesContainer}>
          <MaterialCommunityIcons
            name={totalVotes >= 0 ? "arrow-up-bold" : "arrow-down-bold"}
            size={moderateScale(16)}
            color={totalVotes >= 0 ? "#51CF66" : "#FF6B6B"}
          />
          <Text
            style={[
              styles.upvotesText,
              { color: totalVotes >= 0 ? "#51CF66" : "#FF6B6B" },
            ]}
          >
            {totalVotes} total votes
          </Text>
        </View>
        {currentUser?.is_founding_member === true && <FoundingBadge />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userCard: {
    flexDirection: "row",
    padding: moderateScale(16),
    margin: moderateScale(16),
    borderRadius: moderateScale(16),
    alignItems: "center",
    gap: moderateScale(16),
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: moderateScale(20),
    fontFamily: "Poppins_600SemiBold",
  },
  userEmail: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    marginTop: verticalScale(2),
  },
  upvotesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(4),
    marginTop: verticalScale(4),
  },
  upvotesText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_500Medium",
  },
});
