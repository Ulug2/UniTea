import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDistanceToNowStrict } from "date-fns";
import { router } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import type { PostsSummaryViewRow } from "../../../types/posts";
import type { Database } from "../../../types/database.types";
import type { Theme } from "../../../context/ThemeContext";
import { sharePost } from "../../../utils/sharePost";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

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
    const isLostFound = item.post_type === "lost_found";

    // Keep Lost & Found preview semantics. For feed posts, prefer title when available.
    const displayContent = useMemo(() => {
      const title = item.title?.trim();
      if (!isLostFound) {
        if (title) return title;
        return item.content;
      }
      const category = (item as PostSummary).category;
      if (title) {
        const prefix = category === "found" ? "Found" : "Lost";
        return `${prefix}: ${title}`;
      }
      return item.content;
    }, [isLostFound, item]);

    const finalContent = useMemo(() => {
      const text = (displayContent ?? "").trim();
      const hasImage =
        Boolean((item as PostSummary).image_url) ||
        Boolean((item as PostSummary).image_urls?.length);

      if (!text && hasImage) return "[image]";
      return displayContent;
    }, [displayContent, item]);

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
        onPress={() =>
          router.push(isLostFound ? `/lostfoundpost/${postId}` : `/post/${postId}`)
        }
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
          {finalContent}
        </Text>
        <View style={styles.postFooter}>
          {!isLostFound && (
            <View style={styles.postStat}>
              <MaterialCommunityIcons
                name="arrow-up-bold"
                size={moderateScale(16)}
                color="#51CF66"
              />
              <Text
                style={[styles.postStatText, { color: theme.secondaryText }]}
              >
                {postScore}
              </Text>
            </View>
          )}
          <View style={styles.postStat}>
            <MaterialCommunityIcons
              name="comment-outline"
              size={moderateScale(16)}
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
              sharePost(postId, isLostFound ? "lost_found" : undefined);
            }}
          >
            <Ionicons
              name="share-outline"
              size={moderateScale(16)}
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
    padding: moderateScale(16),
    borderBottomWidth: 1,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: verticalScale(4),
  },
  postLabel: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
  },
  postTime: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
  },
  postContent: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_400Regular",
    marginBottom: verticalScale(8),
  },
  postFooter: {
    flexDirection: "row",
  },
  postStat: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: scale(16),
  },
  postStatText: {
    marginLeft: scale(4),
    fontSize: moderateScale(13),
    fontFamily: "Poppins_400Regular",
  },
});

export default ProfilePostItem;

