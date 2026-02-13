import React, { ReactElement, useCallback, RefObject } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  ViewStyle,
} from "react-native";
import CommentListItem from "../../../components/CommentListItem";
import type { CommentNode } from "../utils/tree";

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
};

export function CommentsTreeList({
  data,
  onReply,
  onDeleteStart,
  onDeleteEnd,
  isRefetching,
  onRefresh,
  listRef,
  style,
  headerComponent,
}: CommentsTreeListProps) {
  const renderCommentItem = useCallback(
    ({ item }: { item: CommentNode }) => (
      <CommentListItem
        comment={item}
        depth={0}
        handleReplyPress={onReply}
        onDeleteStart={onDeleteStart}
        onDeleteEnd={onDeleteEnd}
      />
    ),
    [onReply, onDeleteStart, onDeleteEnd]
  );

  const keyExtractor = useCallback((item: CommentNode) => item.id, []);

  return (
    <FlatList
      ref={listRef as any}
      data={data}
      renderItem={renderCommentItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={headerComponent ?? null}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
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

const styles = StyleSheet.create({
  content: {
    paddingBottom: 20,
  },
});

