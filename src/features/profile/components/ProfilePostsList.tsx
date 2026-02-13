import React, { useCallback } from "react";
import { FlatList, RefreshControl } from "react-native";
import type { Database } from "../../../types/database.types";
import type { PostsSummaryViewRow } from "../../../types/posts";
import type { Theme } from "../../../context/ThemeContext";
import ProfilePostItem from "./ProfilePostItem";

type PostSummary = PostsSummaryViewRow;
type Post = Database["public"]["Tables"]["posts"]["Row"];

type ProfilePostsListProps = {
  theme: Theme;
  posts: (PostSummary | Post)[];
  postScoresMap: Map<string, number>;
  commentCountsMap: Map<string, number>;
  isRefetching: boolean;
  onRefresh: () => void;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onEndReached: () => void;
};

export function ProfilePostsList({
  theme,
  posts,
  postScoresMap,
  commentCountsMap,
  isRefetching,
  onRefresh,
  hasNextPage,
  isFetchingNextPage,
  onEndReached,
}: ProfilePostsListProps) {
  const renderPostItem = useCallback(
    ({ item }: { item: PostSummary | Post }) => {
      const id = "post_id" in item ? item.post_id : item.id;
      const postScore = id ? postScoresMap.get(id) ?? 0 : 0;
      const commentCount = id ? commentCountsMap.get(id) ?? 0 : 0;

      return (
        <ProfilePostItem
          item={item}
          postScore={postScore}
          commentCount={commentCount}
          theme={theme}
        />
      );
    },
    [theme, postScoresMap, commentCountsMap]
  );

  return (
    <FlatList
      data={posts}
      renderItem={renderPostItem}
      keyExtractor={(item, index) => {
        const id = "post_id" in item ? item.post_id : item.id;
        return id ? `${id}` : `post-${index}`;
      }}
      removeClippedSubviews
      maxToRenderPerBatch={5}
      updateCellsBatchingPeriod={50}
      initialNumToRender={5}
      windowSize={5}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={onRefresh}
          tintColor={theme.primary}
        />
      }
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          onEndReached();
        }
      }}
      onEndReachedThreshold={0.5}
    />
  );
}

