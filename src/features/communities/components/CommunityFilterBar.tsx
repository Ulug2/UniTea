import React, { useCallback, useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import { useMyCommunities } from "../hooks/useMyCommunities";
import type { Community } from "../types";

const CAMPUS_PILL = "__campus__";
const DISCOVER_PILL = "__discover__";

type PillItem =
  | { kind: "campus"; key: string }
  | { kind: "community"; key: string; community: Community }
  | { kind: "discover"; key: string };

type CommunityFilterBarProps = {
  activeCommunityId: string | null;
  onSelect: (communityId: string | null) => void;
  onDiscover: () => void;
};

type PillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  iconLeft?: React.ReactNode;
  dashed?: boolean;
};

const Pill = React.memo(function Pill({
  label,
  selected,
  onPress,
  iconLeft,
  dashed,
}: PillProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? theme.primary + "20" : theme.card,
          borderColor: selected ? theme.primary : theme.border,
          borderStyle: dashed ? "dashed" : "solid",
        },
      ]}
    >
      {iconLeft}
      <Text
        numberOfLines={1}
        style={[
          styles.pillText,
          { color: selected ? theme.primary : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

function CommunityFilterBar({
  activeCommunityId,
  onSelect,
  onDiscover,
}: CommunityFilterBarProps) {
  const { theme } = useTheme();
  const { communities } = useMyCommunities();

  const data = useMemo<PillItem[]>(() => {
    const items: PillItem[] = [{ kind: "discover", key: DISCOVER_PILL }];
    items.push({ kind: "campus", key: CAMPUS_PILL });
    for (const community of communities) {
      items.push({ kind: "community", key: community.id, community });
    }
    return items;
  }, [communities]);

  const keyExtractor = useCallback((item: PillItem) => item.key, []);

  const renderItem = useCallback(
    ({ item }: { item: PillItem }) => {
      if (item.kind === "campus") {
        return (
          <Pill
            label="Campus Feed"
            selected={activeCommunityId === null}
            onPress={() => onSelect(null)}
          />
        );
      }
      if (item.kind === "discover") {
        return (
          <Pill
            label="Discover"
            selected={false}
            dashed
            onPress={onDiscover}
            iconLeft={
              <Ionicons
                name="add"
                size={moderateScale(16)}
                color={theme.primary}
                style={styles.pillIcon}
              />
            }
          />
        );
      }
      return (
        <Pill
          label={item.community.name}
          selected={activeCommunityId === item.community.id}
          onPress={() => onSelect(item.community.id)}
        />
      );
    },
    [activeCommunityId, onSelect, onDiscover, theme.primary],
  );

  return (
    <View style={[styles.container, { borderBottomColor: theme.border }]}>
      <FlatList
        horizontal
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews
      />
    </View>
  );
}

export default React.memo(CommunityFilterBar);

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listContent: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    gap: moderateScale(8),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(7),
    borderRadius: moderateScale(999),
    borderWidth: 1,
    maxWidth: scale(180),
  },
  pillIcon: {
    marginRight: scale(2),
  },
  pillText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
});
