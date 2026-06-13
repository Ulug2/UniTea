import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import SupabaseImage from "../../../components/SupabaseImage";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import type { CommunityDirectoryEntry } from "../types";

type CommunityDirectoryItemProps = {
  community: CommunityDirectoryEntry;
  isMember: boolean;
  isBusy: boolean;
  onToggleMembership: (community: CommunityDirectoryEntry, isMember: boolean) => void;
  onPress?: (community: CommunityDirectoryEntry) => void;
};

function formatMemberCount(count: number): string {
  return count === 1 ? "1 member" : `${count} members`;
}

function CommunityDirectoryItem({
  community,
  isMember,
  isBusy,
  onToggleMembership,
  onPress,
}: CommunityDirectoryItemProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => onPress?.(community)}
      style={[
        styles.container,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: theme.background }]}>
        {community.avatar_url ? (
          <SupabaseImage
            path={community.avatar_url}
            bucket="post-images"
            style={styles.avatarImage}
          />
        ) : (
          <Ionicons
            name="people"
            size={moderateScale(22)}
            color={theme.primary}
          />
        )}
      </View>

      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[styles.name, { color: theme.text }]}
        >
          {community.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.memberCount, { color: theme.secondaryText }]}
        >
          {formatMemberCount(community.member_count)}
        </Text>
        {community.description ? (
          <Text
            numberOfLines={2}
            style={[styles.description, { color: theme.secondaryText }]}
          >
            {community.description}
          </Text>
        ) : null}
      </View>

      <Pressable
        disabled={isBusy}
        onPress={() => onToggleMembership(community, isMember)}
        style={[
          styles.button,
          isMember
            ? { backgroundColor: theme.background, borderColor: theme.border }
            : { backgroundColor: theme.primary, borderColor: theme.primary },
        ]}
      >
        {isBusy ? (
          <ActivityIndicator
            size="small"
            color={isMember ? theme.text : "#fff"}
          />
        ) : (
          <Text
            style={[
              styles.buttonText,
              { color: isMember ? theme.text : "#fff" },
            ]}
          >
            {isMember ? "Leave" : "Join"}
          </Text>
        )}
      </Pressable>
    </Pressable>
  );
}

export default React.memo(CommunityDirectoryItem);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: moderateScale(12),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    marginBottom: verticalScale(10),
  },
  avatar: {
    width: scale(48),
    height: scale(48),
    borderRadius: moderateScale(24),
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  info: {
    flex: 1,
    marginHorizontal: scale(12),
  },
  name: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_600SemiBold",
  },
  memberCount: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_500Medium",
    marginTop: verticalScale(2),
  },
  description: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    marginTop: verticalScale(2),
  },
  button: {
    minWidth: scale(72),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(14),
    borderRadius: moderateScale(999),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_600SemiBold",
  },
});
