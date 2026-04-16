import { Tabs } from "expo-router";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import React from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  PixelRatio,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import { useFilterContext } from "../../../context/FilterContext";
import { useGlobalUnreadCount } from "../../../hooks/useGlobalUnreadCount";

function FilterButtons() {
  const { theme } = useTheme();
  const { selectedFilter, setSelectedFilter } = useFilterContext();
  const fontScale = PixelRatio.getFontScale();
  const filterIconSize = moderateScale(18) * fontScale;

  return (
    <View style={styles.filterButtons}>
      <Pressable
        style={[
          styles.filterBtn,
          selectedFilter === "hot" && { backgroundColor: theme.primary + "20" },
        ]}
        onPress={() => setSelectedFilter("hot")}
      >
        <FontAwesome
          name="fire"
          size={filterIconSize}
          color={selectedFilter === "hot" ? theme.primary : theme.secondaryText}
        />
      </Pressable>
      <Pressable
        style={[
          styles.filterBtn,
          selectedFilter === "new" && { backgroundColor: theme.primary + "20" },
        ]}
        onPress={() => setSelectedFilter("new")}
      >
        <FontAwesome
          name="clock-o"
          size={filterIconSize}
          color={selectedFilter === "new" ? theme.primary : theme.secondaryText}
        />
      </Pressable>
      <Pressable
        style={[
          styles.filterBtn,
          selectedFilter === "top" && { backgroundColor: theme.primary + "20" },
        ]}
        onPress={() => setSelectedFilter("top")}
      >
        <FontAwesome
          name="trophy"
          size={filterIconSize}
          color={selectedFilter === "top" ? theme.primary : theme.secondaryText}
        />
      </Pressable>
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useTheme();
  const globalUnreadCount = useGlobalUnreadCount();
  const insets = useSafeAreaInsets();
  const isAndroid = Platform.OS === "android";
  const fontScale = PixelRatio.getFontScale();
  const tabIconSize = moderateScale(24) * fontScale;
  const baseTabHeight = verticalScale(56);
  const androidBottomInset = isAndroid ? insets.bottom : 0;

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.secondaryText,
          tabBarBackground: () => (
            <View style={{ flex: 1, backgroundColor: theme.card }} />
          ),
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            height: isAndroid
              ? baseTabHeight + androidBottomInset
              : verticalScale(80),
            paddingTop: isAndroid ? verticalScale(6) : 0,
            paddingBottom: androidBottomInset,
          },
          headerStyle: {
            backgroundColor: theme.background,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            height: verticalScale(100),
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Feed",
            headerTitle: "UniTee",
            headerTitleAlign: "left",
            headerTitleStyle: {
              fontSize: moderateScale(28),
              fontWeight: "bold",
              color: theme.text,
            },
            headerRight: () => <FilterButtons />,
            tabBarIcon: ({ color }) => (
              <Ionicons name="home-outline" size={tabIconSize} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            headerTitleAlign: "center",
            headerTitleStyle: {
              fontSize: moderateScale(24),
              fontWeight: "bold",
              color: theme.text,
            },
            tabBarIcon: ({ color }) => (
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={tabIconSize}
                color={color}
              />
            ),
            tabBarBadge: globalUnreadCount > 0 ? globalUnreadCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: "#EF4444",
              fontSize: moderateScale(11),
              minWidth: scale(18),
              height: verticalScale(18),
            },
          }}
        />
        <Tabs.Screen
          name="lostfound"
          options={{
            title: "Lost & Found",
            tabBarHideOnKeyboard: true,
            headerTitleAlign: "center",
            headerTitleStyle: {
              fontSize: moderateScale(24),
              fontWeight: "bold",
              color: theme.text,
            },
            tabBarIcon: ({ color }) => (
              <Ionicons name="bag-outline" size={tabIconSize} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            headerTitleAlign: "center",
            headerTitleStyle: {
              fontSize: moderateScale(24),
              fontWeight: "bold",
              color: theme.text,
            },
            tabBarIcon: ({ color }) => (
              <Ionicons
                name="person-outline"
                size={tabIconSize}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  filterButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(8),
    marginRight: scale(16),
  },
  filterBtn: {
    minWidth: scale(36),
    minHeight: verticalScale(36),
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(18),
    alignItems: "center",
    justifyContent: "center",
  },
});
