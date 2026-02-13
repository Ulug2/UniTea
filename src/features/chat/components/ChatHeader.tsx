import React from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type ChatHeaderProps = {
  onBack?: () => void;
  displayName: string;
  avatarElement: React.ReactNode;
  onRowPress?: () => void;
  onMenuPress?: () => void;
  showMenu?: boolean;
  iconColor?: string;
  styles: {
    header: StyleProp<ViewStyle>;
    backButton: StyleProp<ViewStyle>;
    avatarImage: StyleProp<ViewStyle>;
    userName: StyleProp<ViewStyle>;
    menuButton: StyleProp<ViewStyle>;
  };
};

export function ChatHeader({
  onBack,
  displayName,
  avatarElement,
  onMenuPress,
  showMenu = true,
  iconColor = "#000",
  onRowPress,
  styles: styleSet,
}: ChatHeaderProps) {
  const rowContent = (
    <>
      {avatarElement}
      <Text style={styleSet.userName} numberOfLines={1}>
        {displayName}
      </Text>
    </>
  );
  return (
    <View style={styleSet.header}>
      <Pressable onPress={onBack ?? (() => router.back())} style={styleSet.backButton}>
        <Ionicons name="arrow-back" size={24} color={iconColor} />
      </Pressable>
      {onRowPress ? (
        <Pressable style={{ flexDirection: "row", alignItems: "center", flex: 1 }} onPress={onRowPress}>
          {rowContent}
        </Pressable>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {rowContent}
        </View>
      )}
      {showMenu && onMenuPress && (
        <Pressable style={styleSet.menuButton} onPress={onMenuPress}>
          <Ionicons name="ellipsis-vertical" size={24} color={iconColor} />
        </Pressable>
      )}
    </View>
  );
}
