import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Dimensions,
  Animated,
  Platform,
  Keyboard,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import PostListItem from "../../../components/PostListItem";
import PostListSkeleton from "../../../components/PostListSkeleton";
import CustomInput from "../../../components/CustomInput";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import {
  useInfiniteQuery,
  useQueryClient,
  useIsMutating,
} from "@tanstack/react-query";
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import type { PostsSummaryViewRow } from "../../../types/posts";
import { useFilterContext } from "../../../context/FilterContext";
import { useAuth } from "../../../context/AuthContext";
import { useRevealAfterFirstNImages } from "../../../hooks/useRevealAfterFirstNImages";
import { useBlocks, isBlockedPost } from "../../../hooks/useBlocks";
import { useMyProfile } from "../../../features/profile/hooks/useMyProfile";
import { saveFeedToStorage } from "../../../utils/feedPersistence";
import { FullscreenImageModal } from "../../../components/FullscreenImageModal";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

type PostSummary = PostsSummaryViewRow;

const POSTS_PER_PAGE = 10;
const ENABLE_FEED_DIAGNOSTICS = false;
const SEARCH_BAR_HEIGHT = verticalScale(64);
const SEARCH_HIDE_SCROLL_Y = verticalScale(30);
const PULL_REVEAL_THRESHOLD = -verticalScale(80);

const FEED_FILTER_ORDER = ["hot", "new", "top"] as const;
type FeedFilterType = (typeof FEED_FILTER_ORDER)[number];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Single feed "page" for one filter – used inside the horizontal pager
function FeedPageContent({
  filter,
  searchQuery,
  activeSearchQuery,
  onSearchQueryChange,
  onSearchSubmit,
}: {
  filter: FeedFilterType;
  searchQuery: string;
  activeSearchQuery: string;
  onSearchQueryChange: (nextValue: string) => void;
  onSearchSubmit: () => void;
}) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { hiddenPostIds } = useFilterContext();
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchHeightAnim = useRef(new Animated.Value(0)).current;

  const { data: blocks = [] } = useBlocks();
  const { data: currentUser } = useMyProfile(currentUserId);
  const isAdmin = currentUser?.is_admin === true;

  // Fetch posts for this filter only
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["posts", "feed", filter, activeSearchQuery],
    queryFn: async ({ pageParam = 0 }) => {
      let query = (supabase as any)
        .from("posts_summary_view")
        .select("*")
        .eq("post_type", "feed")
        .not("is_banned", "is", "true");

      const normalizedSearch = activeSearchQuery
        .trim()
        .replace(/[%*]/g, "")
        .replace(/,/g, " ");
      if (normalizedSearch.length > 0) {
        const pattern = `*${normalizedSearch}*`;
        // Priority: title match first; fallback to content when title is null/empty.
        query = query.or(
          `title.ilike.${pattern},and(title.is.null,content.ilike.${pattern}),and(title.eq."",content.ilike.${pattern})`,
        );
      }

      switch (filter) {
        case "new":
          // Sort by newest first
          const from = pageParam * POSTS_PER_PAGE;
          const to = from + POSTS_PER_PAGE - 1;
          query = query
            .order("created_at", { ascending: false })
            .range(from, to);
          break;

        case "top":
          // Sort by highest votes in the last week
          const lastWeek = new Date();
          lastWeek.setDate(lastWeek.getDate() - 7);
          const topFrom = pageParam * POSTS_PER_PAGE;
          const topTo = topFrom + POSTS_PER_PAGE - 1;
          query = query
            .gte("created_at", lastWeek.toISOString())
            .order("vote_score", { ascending: false })
            .range(topFrom, topTo);
          break;

        case "hot":
          // Sort server-side on dynamic hot_score from posts_summary_view.
          // 10 rows per page — same as the other filters.
          const last7Days = new Date();
          last7Days.setDate(last7Days.getDate() - 7);
          const hotFrom = pageParam * POSTS_PER_PAGE;
          const hotTo = hotFrom + POSTS_PER_PAGE - 1;
          query = query
            .gte("created_at", last7Days.toISOString())
            .order("hot_score", { ascending: false })
            .range(hotFrom, hotTo);
          break;
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PostSummary[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length === POSTS_PER_PAGE) return allPages.length;
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  // Flatten pages into single array, remove duplicates, filter blocked users, and sort by engagement for "hot"
  const posts = useMemo(() => {
    if (!postsData?.pages) return [];

    const allPosts = postsData.pages.flat();
    if (allPosts.length === 0) return [];

    const uniquePosts = Array.from(
      new Map(allPosts.map((post) => [post.post_id, post])).values(),
    );

    // Scope-aware block filtering: anonymous_only hides anon posts, profile_only hides public posts
    let filteredPosts = uniquePosts;
    if (blocks.length > 0) {
      filteredPosts = uniquePosts.filter((post) => {
        if (isBlockedPost(blocks, post.user_id, post.is_anonymous ?? false))
          return false;
        if (
          post.original_user_id &&
          isBlockedPost(
            blocks,
            post.original_user_id,
            post.original_is_anonymous ?? false,
          )
        )
          return false;
        return true;
      });
    }

    return filteredPosts.filter(
      (post) => !hiddenPostIds.includes(post.post_id),
    );
  }, [postsData, blocks, hiddenPostIds]);

  useEffect(() => {
    if (!__DEV__ || !ENABLE_FEED_DIAGNOSTICS) return;
    console.log("[feed-diagnostics]", {
      filter,
      postCount: posts.length,
      isPending,
      isRefetching,
      isFetchingNextPage,
    });
  }, [filter, posts.length, isPending, isRefetching, isFetchingNextPage]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Persist the first page to AsyncStorage after every successful fetch so the
  // next cold start can seed the RQ cache before the splash screen hides.
  useEffect(() => {
    if (postsData?.pages?.length) {
      saveFeedToStorage(filter, postsData.pages as PostSummary[][]);
    }
  }, [postsData, filter]);

  const keyExtractor = useCallback((item: PostSummary) => item.post_id, []);

  // Skip the reveal-overlay when data is already in cache (seeded from
  // AsyncStorage). Images are served from expo-image's disk cache so there is
  // nothing to wait for.
  const { shouldReveal, onItemReady } = useRevealAfterFirstNImages({
    minItems: 3,
    timeoutMs: 2500,
    initialRevealed: !!postsData,
  });

  const renderItem = useCallback(
    ({ item, index }: { item: PostSummary; index: number }) => (
      <PostListItem
        postId={item.post_id}
        userId={item.user_id}
        content={item.content}
        title={item.title}
        imageUrl={item.image_url}
        imageUrls={item.image_urls ?? null}
        imageAspectRatio={item.image_aspect_ratio}
        category={item.category}
        location={item.location}
        postType={item.post_type}
        isAnonymous={item.is_anonymous}
        isEdited={item.is_edited}
        createdAt={item.created_at}
        updatedAt={item.updated_at}
        editedAt={item.edited_at}
        viewCount={item.view_count}
        username={item.username}
        avatarUrl={item.avatar_url}
        isVerified={item.is_verified}
        commentCount={item.comment_count}
        voteScore={item.vote_score}
        repostCount={item.repost_count}
        repostedFromPostId={item.reposted_from_post_id}
        repostComment={item.repost_comment}
        originalContent={item.original_content}
        originalTitle={item.original_title}
        originalImageUrl={item.original_image_url}
        originalImageUrls={item.original_image_urls ?? null}
        originalImageAspectRatio={item.original_image_aspect_ratio}
        originalUserId={item.original_user_id}
        originalAuthorUsername={item.original_author_username}
        originalAuthorAvatar={item.original_author_avatar}
        originalIsAnonymous={item.original_is_anonymous}
        originalCreatedAt={item.original_created_at}
        onImagePress={setFullscreenUri}
        onImageLoad={index < 5 ? onItemReady : undefined}
        isAdmin={isAdmin}
      />
    ),
    [onItemReady, isAdmin],
  );

  useEffect(() => {
    Animated.timing(searchHeightAnim, {
      toValue: searchVisible ? SEARCH_BAR_HEIGHT : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [searchVisible, searchHeightAnim]);

  const handleSearchSubmit = useCallback(() => {
    Keyboard.dismiss();
    onSearchSubmit();
  }, [onSearchSubmit]);

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      if (!searchVisible && offsetY < PULL_REVEAL_THRESHOLD) {
        setSearchVisible(true);
        return;
      }
      if (searchVisible && offsetY > SEARCH_HIDE_SCROLL_Y) {
        Keyboard.dismiss();
        setSearchVisible(false);
      }
    },
    [searchVisible],
  );

  if (isPending) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.skeletonContent}
        >
          <PostListSkeleton />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View
        style={{
          flex: 1,
          opacity: shouldReveal ? 1 : 0,
          pointerEvents: shouldReveal ? "auto" : "none",
        }}
      >
        <Animated.View
          style={[
            styles.searchHeaderContainer,
            {
              height: searchHeightAnim,
              opacity: searchHeightAnim.interpolate({
                inputRange: [0, SEARCH_BAR_HEIGHT],
                outputRange: [0, 1],
              }),
              backgroundColor: theme.background,
            },
          ]}
        >
          <View style={styles.searchHeaderInner}>
            <CustomInput
              placeholder="Search posts..."
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              leftIcon={{ type: "font-awesome", name: "search" }}
              returnKeyType="search"
              onSubmitEditing={handleSearchSubmit}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
              rightElement={
                <Pressable onPress={handleSearchSubmit} hitSlop={moderateScale(8)}>
                  <Feather
                    name="arrow-right-circle"
                    size={moderateScale(24)}
                    color={theme.primary}
                  />
                </Pressable>
              }
            />
          </View>
        </Animated.View>
        <FlatList
          style={{ flex: 1 }}
          data={posts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          nestedScrollEnabled
          removeClippedSubviews={true}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={100}
          initialNumToRender={5}
          windowSize={5}
          onScroll={handleListScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={searchVisible && isRefetching}
              onRefresh={() => {
                if (!searchVisible) {
                  setSearchVisible(true);
                } else {
                  refetch();
                }
              }}
              tintColor={theme.primary}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View
                style={{ padding: moderateScale(16), alignItems: "center" }}
              >
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                {activeSearchQuery ? "No results for your search" : "No posts yet"}
              </Text>
            </View>
          }
          contentInsetAdjustmentBehavior="automatic"
        />
      </View>
      {!shouldReveal && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.background },
          ]}
          pointerEvents="none"
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.skeletonContent}
          >
            <PostListSkeleton />
          </ScrollView>
        </View>
      )}

      <FullscreenImageModal
        visible={Boolean(fullscreenUri)}
        uri={fullscreenUri}
        onClose={() => setFullscreenUri(null)}
      />
    </View>
  );
}

// Main feed screen: native pager (Instagram-style) – content slides with your finger
export default function FeedScreen() {
  const { theme } = useTheme();
  const { selectedFilter, setSelectedFilter } = useFilterContext();
  const queryClient = useQueryClient();
  const pagerRef = useRef<ScrollView>(null);
  const resolvedInitialPageIndex = Math.max(
    FEED_FILTER_ORDER.indexOf(selectedFilter as FeedFilterType),
    0,
  );
  const [activePageIndex, setActivePageIndex] = useState(resolvedInitialPageIndex);
  const [searchQueryByFilter, setSearchQueryByFilter] = useState<
    Record<FeedFilterType, string>
  >({
    hot: "",
    new: "",
    top: "",
  });
  const [activeSearchByFilter, setActiveSearchByFilter] = useState<
    Record<FeedFilterType, string>
  >({
    hot: "",
    new: "",
    top: "",
  });

  const isCreatingPost = useIsMutating({ mutationKey: ["create-post"] }) > 0;

  // When user taps a filter pill, scroll to the corresponding page
  useEffect(() => {
    const pageIndex = FEED_FILTER_ORDER.indexOf(
      selectedFilter as FeedFilterType,
    );
    if (pageIndex < 0) return;
    setActivePageIndex(pageIndex);
    pagerRef.current?.scrollTo({
      x: pageIndex * SCREEN_WIDTH,
      y: 0,
      animated: true,
    });
  }, [selectedFilter]);

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const position = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      const safePosition = Math.min(
        Math.max(position, 0),
        FEED_FILTER_ORDER.length - 1,
      );
      const filter = FEED_FILTER_ORDER[safePosition];
      setActivePageIndex(safePosition);
      setSelectedFilter(filter);
    },
    [setSelectedFilter],
  );

  useEffect(() => {
    let isMounted = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("posts-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            if (isMounted) {
              queryClient.invalidateQueries({
                queryKey: ["posts", "feed"],
                refetchType: "none",
              });
            }
          }, 1000);
        },
      )
      .subscribe();
    return () => {
      isMounted = false;
      if (debounce) clearTimeout(debounce);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const initialPageIndex = resolvedInitialPageIndex;

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handlePageSelected}
          contentOffset={{
            x: Math.max(0, initialPageIndex) * SCREEN_WIDTH,
            y: 0,
          }}
          style={styles.pager}
        >
          {FEED_FILTER_ORDER.map((filter, index) => (
            <View key={filter} style={styles.pageWrapper}>
              {Math.abs(index - activePageIndex) <= 1 ? (
                <FeedPageContent
                  filter={filter}
                  searchQuery={searchQueryByFilter[filter]}
                  activeSearchQuery={activeSearchByFilter[filter]}
                  onSearchQueryChange={(nextValue) => {
                    setSearchQueryByFilter((previous) => ({
                      ...previous,
                      [filter]: nextValue,
                    }));
                    if (nextValue.trim() === "") {
                      setActiveSearchByFilter((prev) => ({
                        ...prev,
                        [filter]: "",
                      }));
                    }
                  }}
                  onSearchSubmit={() => {
                    setActiveSearchByFilter((prev) => ({
                      ...prev,
                      [filter]: searchQueryByFilter[filter].trim().toLowerCase(),
                    }));
                  }}
                />
              ) : (
                <View style={[styles.page, { backgroundColor: theme.background }]} />
              )}
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={() => router.push("/create-post")}
          style={[styles.fab, { backgroundColor: theme.primary }]}
        >
          <FontAwesome name="plus" size={moderateScale(28)} color="#fff" />
        </Pressable>
      </View>
      <Modal
        visible={isCreatingPost}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => { }}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(255, 255, 255, 0.6)",
              justifyContent: "center",
              alignItems: "center",
            },
          ]}
          pointerEvents="auto"
        >
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  pageWrapper: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  skeletonContent: {
    paddingBottom: verticalScale(100),
  },
  searchHeaderContainer: {
    overflow: "hidden",
  },
  searchHeaderInner: {
    height: SEARCH_BAR_HEIGHT,
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(8),
    justifyContent: "center",
  },
  searchInput: {
    marginBottom: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: verticalScale(100),
  },
  emptyText: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_400Regular",
  },
  fab: {
    position: "absolute",
    bottom: verticalScale(20),
    right: scale(20),
    width: scale(60),
    height: verticalScale(60),
    borderRadius: moderateScale(30),
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: verticalScale(4),
    },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(4.65),
  },
});
