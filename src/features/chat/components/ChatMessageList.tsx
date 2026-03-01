import React from "react";
import {
  View,
  FlatList,
  Pressable,
  Text,
  ActivityIndicator,
  type ListRenderItem,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import type { ChatMessageVM } from "../types";

type ChatMessageListProps<T = ChatMessageVM> = {
  messages: T[];
  listRef: React.RefObject<FlatList<T> | null>;
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T) => string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  inverted?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  ListFooterComponent?: React.ReactElement | null;
  newMessagesPillCount: number;
  onNewMessagesPress: () => void;
  isAtBottom: boolean;
  newMessagesPillStyles: { pill: StyleProp<ViewStyle>; text: StyleProp<TextStyle> };
  theme: { primary: string };
  /** When true, maintainVisibleContentPosition is disabled to avoid list jump/lag when scrolling with keyboard open. */
  isKeyboardVisible?: boolean;
};

export function ChatMessageList<T = ChatMessageVM>({
  messages,
  listRef,
  renderItem,
  keyExtractor,
  contentContainerStyle,
  inverted = true,
  onScroll,
  onEndReached,
  onEndReachedThreshold = 0.5,
  hasNextPage,
  isFetchingNextPage,
  newMessagesPillCount,
  onNewMessagesPress,
  isAtBottom,
  newMessagesPillStyles,
  theme,
  isKeyboardVisible = false,
}: ChatMessageListProps<T>) {
  const listFooter =
    isFetchingNextPage ? (
      <View style={{ padding: 16, alignItems: "center" }}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    ) : null;

  return (
    <>
      {newMessagesPillCount > 0 && !isAtBottom && (
        <Pressable style={newMessagesPillStyles.pill} onPress={onNewMessagesPress}>
          <Text style={newMessagesPillStyles.text}>
            {newMessagesPillCount === 1
              ? "1 new message"
              : `${newMessagesPillCount} new messages`}
          </Text>
        </Pressable>
      )}
      <FlatList
        ref={listRef as React.RefObject<FlatList<T> | null>}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={contentContainerStyle}
        inverted={inverted}
        maintainVisibleContentPosition={
          isKeyboardVisible ? undefined : { minIndexForVisible: 0 }
        }
        windowSize={10}
        maxToRenderPerBatch={20}
        initialNumToRender={20}
        removeClippedSubviews
        onScroll={onScroll}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        ListFooterComponent={listFooter}
      />
    </>
  );
}
