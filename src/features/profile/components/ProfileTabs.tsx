import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Theme } from "../../../context/ThemeContext";
import type { ProfileTab } from "../hooks/useMyPosts";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

type ProfileTabsProps = {
  theme: Theme;
  activeTab: ProfileTab;
  onChangeTab: (tab: ProfileTab) => void;
};

export function ProfileTabs({ theme, activeTab, onChangeTab }: ProfileTabsProps) {
  return (
    <View style={styles.tabsContainer}>
      <Pressable
        style={[
          styles.tab,
          activeTab === "all" && styles.activeTab,
          {
            backgroundColor:
              activeTab === "all" ? theme.card : "transparent",
          },
        ]}
        onPress={() => onChangeTab("all")}
      >
        <Text
          style={[
            styles.tabText,
            {
              color:
                activeTab === "all" ? theme.text : theme.secondaryText,
            },
          ]}
        >
          All Posts
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.tab,
          activeTab === "anonymous" && styles.activeTab,
          {
            backgroundColor:
              activeTab === "anonymous" ? theme.card : "transparent",
          },
        ]}
        onPress={() => onChangeTab("anonymous")}
      >
        <Text
          style={[
            styles.tabText,
            {
              color:
                activeTab === "anonymous"
                  ? theme.text
                  : theme.secondaryText,
            },
          ]}
        >
          Anonymous
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.tab,
          activeTab === "bookmarked" && styles.activeTab,
          {
            backgroundColor:
              activeTab === "bookmarked" ? theme.card : "transparent",
          },
        ]}
        onPress={() => onChangeTab("bookmarked")}
      >
        <Text
          style={[
            styles.tabText,
            {
              color:
                activeTab === "bookmarked"
                  ? theme.text
                  : theme.secondaryText,
            },
          ]}
        >
          Bookmarked
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: scale(16),
    gap: moderateScale(12),
    marginBottom: verticalScale(16),
  },
  tab: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    alignItems: "center",
  },
  activeTab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(4),
    elevation: 2,
  },
  tabText: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_600SemiBold",
  },
});

