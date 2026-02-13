import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import SupabaseImage from "../../../components/SupabaseImage";
import { DEFAULT_AVATAR } from "../../../constants/images";
import type { Theme } from "../../../context/ThemeContext";
import type { Database } from "../../../types/database.types";

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
      <Pressable style={styles.avatarContainer} onPress={onAvatarPress}>
        {currentUser?.avatar_url ? (
          currentUser.avatar_url.startsWith("http") ? (
            <Image
              source={{ uri: currentUser.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <SupabaseImage
              path={currentUser.avatar_url}
              bucket="avatars"
              style={styles.avatar}
            />
          )
        ) : (
          <Image source={DEFAULT_AVATAR} style={styles.avatar} />
        )}
      </Pressable>
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
            size={16}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userCard: {
    flexDirection: "row",
    padding: 16,
    margin: 16,
    borderRadius: 16,
    alignItems: "center",
    gap: 16,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 90,
    overflow: "hidden",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  userEmail: {
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    marginTop: 2,
  },
  upvotesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  upvotesText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
});

