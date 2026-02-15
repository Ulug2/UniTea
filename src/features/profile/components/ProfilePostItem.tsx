import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDistanceToNowStrict } from "date-fns";
import { router } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import type { PostsSummaryViewRow } from "../../../types/posts";
import type { Database } from "../../../types/database.types";
import type { Theme } from "../../../context/ThemeContext";
import { sharePost } from "../../../utils/sharePost";

type Post = Database["public"]["Tables"]["posts"]["Row"];

type PostSummary = PostsSummaryViewRow;

type ProfilePostItemProps = {
  item: PostSummary | Post;
  postScore: number;
  commentCount: number;
  theme: Theme;
};

const ProfilePostItem = memo(
  ({ item, postScore, commentCount, theme }: ProfilePostItemProps) => {
    const postId = "post_id" in item ? item.post_id : item.id;
    const timeAgo = useMemo(() => {
      return item.created_at
        ? formatDistanceToNowStrict(new Date(item.created_at), {
          addSuffix: false,
        })
        : "";
    }, [item.created_at]);

    return (
      <Pressable
        style={[
          styles.postCard,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
        onPress={() => router.push(`/post/${postId}`)}
      >
        <View style={styles.postHeader}>
          <Text style={[styles.postLabel, { color: theme.secondaryText }]}>
            Posted {item.is_anonymous ? "anonymously" : "publicly"}
          </Text>
          <Text style={[styles.postTime, { color: theme.secondaryText }]}>
            {timeAgo}
          </Text>
        </View>
        <Text
          style={[styles.postContent, { color: theme.text }]}
          numberOfLines={2}
        >
          {item.content}
        </Text>
        <View style={styles.postFooter}>
          <View style={styles.postStat}>
            <MaterialCommunityIcons
              name="arrow-up-bold"
              size={16}
              color="#51CF66"
            />
            <Text
              style={[styles.postStatText, { color: theme.secondaryText }]}
            >
              {postScore}
            </Text>
          </View>
          <View style={styles.postStat}>
            <MaterialCommunityIcons
              name="comment-outline"
              size={16}
              color={theme.secondaryText}
            />
            <Text
              style={[styles.postStatText, { color: theme.secondaryText }]}
            >
              {commentCount}
            </Text>
          </View>
          <Pressable
            style={styles.postStat}
            onPress={(e) => {
              e.stopPropagation();
              sharePost(postId);
            }}
          >
            <Ionicons
              name="share-outline"
              size={16}
              color={theme.secondaryText}
            />
          </Pressable>
        </View>
      </Pressable>
    );
  },
  (prevProps, nextProps) => {
    const prevId =
      "post_id" in prevProps.item
        ? (prevProps.item as PostSummary).post_id
        : (prevProps.item as Post).id;
    const nextId =
      "post_id" in nextProps.item
        ? (nextProps.item as PostSummary).post_id
        : (nextProps.item as Post).id;

    return (
      prevId === nextId &&
      prevProps.postScore === nextProps.postScore &&
      prevProps.commentCount === nextProps.commentCount &&
      prevProps.theme.card === nextProps.theme.card &&
      prevProps.theme.border === nextProps.theme.border &&
      prevProps.theme.text === nextProps.theme.text &&
      prevProps.theme.secondaryText === nextProps.theme.secondaryText
    );
  }
);

ProfilePostItem.displayName = "ProfilePostItem";

const styles = StyleSheet.create({
  postCard: {
    padding: 16,
    borderBottomWidth: 1,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  postLabel: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  postTime: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  postContent: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
    marginBottom: 8,
  },
  postFooter: {
    flexDirection: "row",
  },
  postStat: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  postStatText: {
    marginLeft: 4,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
});

export default ProfilePostItem;

