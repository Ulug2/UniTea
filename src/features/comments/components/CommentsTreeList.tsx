import React, { ReactElement, useCallback, useMemo, RefObject } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import CommentListItem from "../../../components/CommentListItem";
import type { CommentNode } from "../utils/tree";
import { useTheme } from "../../../context/ThemeContext";

type CommentsTreeListProps = {
  data: CommentNode[];
  onReply: (commentId: string) => void;
  onDeleteStart: (commentId: string) => void;
  onDeleteEnd: () => void;
  isRefetching: boolean;
  onRefresh: () => void;
  listRef?: RefObject<FlatList<CommentNode> | null>;
  style?: ViewStyle;
  headerComponent?: ReactElement | null;
  isAdmin?: boolean;
  /** Shows an inline spinner when there are no cached comments yet. */
  isLoading?: boolean;
};

function CommentsTreeListBase({
  data,
  onReply,
  onDeleteStart,
  onDeleteEnd,
  isRefetching,
  onRefresh,
  listRef,
  style,
  headerComponent,
  isAdmin = false,
  isLoading = false,
}: CommentsTreeListProps) {
  const { theme } = useTheme();

  const renderCommentItem = useCallback(
    ({ item }: { item: CommentNode }) => (
      <CommentListItem
        comment={item}
        depth={0}
        handleReplyPress={onReply}
        onDeleteStart={onDeleteStart}
        onDeleteEnd={onDeleteEnd}
        isAdmin={isAdmin}
      />
    ),
    [onReply, onDeleteStart, onDeleteEnd, isAdmin],
  );

  const keyExtractor = useCallback((item: CommentNode) => item.id, []);

  const emptyComponent = useMemo(
    () =>
      isLoading ? (
        <View style={styles.emptyLoading}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : null,
    [isLoading, theme.primary],
  );

  return (
    <FlatList
      ref={listRef as any}
      data={data}
      renderItem={renderCommentItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={headerComponent ?? null}
      ListEmptyComponent={emptyComponent}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      style={style}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={7}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
      }
    />
  );
}

export const CommentsTreeList = React.memo(CommentsTreeListBase);

const styles = StyleSheet.create({
  content: {
    paddingBottom: 20,
  },
  emptyLoading: {
    paddingTop: 32,
    alignItems: "center",
  },
});

