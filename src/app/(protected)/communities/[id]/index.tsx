import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Ionicons,
  Entypo,
  MaterialCommunityIcons,
  FontAwesome,
} from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../../../context/ThemeContext";
import { useAuth } from "../../../../context/AuthContext";
import { useFilterContext } from "../../../../context/FilterContext";
import { useMyProfile } from "../../../../features/profile/hooks/useMyProfile";
import { useCommunity } from "../../../../features/communities/hooks/useCommunity";
import { useReportCommunity } from "../../../../features/communities/hooks/useReportCommunity";
import { communityKeys } from "../../../../features/communities/data/queryKeys";
import {
  useMyCommunities,
} from "../../../../features/communities/hooks/useMyCommunities";
import {
  useJoinCommunity,
  useLeaveCommunity,
} from "../../../../features/communities/hooks/useCommunityMembership";
import { useFeedPosts, type FeedFilterType } from "../../../../hooks/useFeedPosts";
import { useRevealAfterFirstNImages } from "../../../../hooks/useRevealAfterFirstNImages";
import PostListItem from "../../../../components/PostListItem";
import ReportModal from "../../../../components/ReportModal";
import { FullscreenImageModal } from "../../../../components/FullscreenImageModal";
import SupabaseImage from "../../../../components/SupabaseImage";
import EntityAvatar from "../../../../components/EntityAvatar";
import { getAvatarForEntity } from "../../../../utils/entityDisplay";
import { formatMemberCount } from "../../../../features/communities/utils";
import { moderateScale, scale, verticalScale } from "../../../../utils/scaling";
import type { PostsSummaryViewRow } from "../../../../types/posts";

type PostSummary = PostsSummaryViewRow;

// Preview page default — no filter UI in this first implementation (the
// audit found no product requirement for one; Hot matches the app's own
// default elsewhere). Local to this screen only — see the FilterContext
// note below.
const DEFAULT_FILTER: FeedFilterType = "hot";

export default function CommunityViewScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const fontScale = PixelRatio.getFontScale();
  const fabIconSize = moderateScale(28) * fontScale;
  const { id } = useLocalSearchParams<{ id: string }>();
  const communityId = typeof id === "string" ? id : id?.[0];
  const queryClient = useQueryClient();

  const { session, cachedProfile } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: currentUser } = useMyProfile(currentUserId);
  const isAdmin = currentUser?.is_admin === true;
  const universityId =
    currentUser?.university_id ?? cachedProfile?.university_id ?? undefined;

  // Only hiddenPostIds is consumed here — selectedFilter/setSelectedFilter
  // (the Home Feed's global filter tab) is deliberately never touched by
  // this screen (see DEFAULT_FILTER / filter state below). hiddenPostIds is
  // a different concept: a per-post "I hid this" list that's meant to apply
  // everywhere a post could appear, not a per-screen filter selection, so
  // reading it here doesn't reintroduce the cross-screen leak the audit
  // flagged for selectedFilter.
  const { hiddenPostIds } = useFilterContext();

  // ── Community metadata ──────────────────────────────────────────────────
  const {
    data: community,
    isPending: isCommunityPending,
  } = useCommunity(communityId);

  const isOwner = !!community && community.created_by === currentUserId;
  const canManage = isOwner || isAdmin;

  // Snapshot, once, whether this exact community was already sitting in the
  // React Query cache when this screen mounted (prefetched on tap from
  // Discover, or a same-session revisit) — same one-time pattern as Post
  // Detail's wasPostCachedOnMount (Phase 7.8), not a per-render recomputed
  // boolean.
  const [wasCommunityCachedOnMount] = useState(
    () => queryClient.getQueryData(communityKeys.detail(communityId)) != null,
  );

  // Reveal gate for the header's own avatar only (mirrors Post Detail's
  // single-item pattern: minItems:1, one avatar). Deliberately NOT applied
  // list-wide to the posts below — the header must always be shown (and
  // Join/Leave must always be usable) the moment community data itself is
  // ready, regardless of whether this community has any posts at all or
  // how long their images take to load (see the empty-state requirement).
  const { shouldReveal: isHeaderReady, onItemReady: reportHeaderReady } =
    useRevealAfterFirstNImages({
      minItems: 1,
      timeoutMs: 2500,
      initialRevealed: wasCommunityCachedOnMount,
      resetKey: communityId,
    });

  // ── Membership ───────────────────────────────────────────────────────────
  const { joinedIds } = useMyCommunities();
  const isMember = communityId ? joinedIds.has(communityId) : false;
  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();

  // Optimistic, not awaited: useJoinCommunity/useLeaveCommunity already
  // update the communityKeys.mine(userId) cache synchronously in onMutate
  // (with rollback + an Alert in onError), so isMember flips instantly the
  // moment mutate() is called — no spinner/disabled state needed here to
  // "wait" for anything the cache hasn't already reflected.
  const handleToggleMembership = useCallback(() => {
    if (!community) return;
    if (isMember) {
      leaveMutation.mutate(community.id);
    } else {
      joinMutation.mutate(community);
    }
  }, [community, isMember, joinMutation, leaveMutation]);

  // ── Posts ────────────────────────────────────────────────────────────────
  const [filter] = useState<FeedFilterType>(DEFAULT_FILTER);

  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: isPostsPending,
    refetch: refetchPosts,
    isRefetching: isRefetchingPosts,
  } = useFeedPosts({
    filter,
    activeSearchQuery: "",
    universityId,
    communityId: communityId ?? null,
    enabled: !!communityId && !!universityId,
  });

  // Same dedupe/block-filter/hidden-filter shape as the Home Feed's own
  // posts memo (index.tsx) — block filtering is computed server-side in
  // posts_summary_view, so this works correctly for anonymous posts too.
  const posts = useMemo(() => {
    if (!postsData?.pages) return [];
    const allPosts = postsData.pages.flat();
    if (allPosts.length === 0) return [];
    const uniquePosts = Array.from(
      new Map(allPosts.map((post) => [post.post_id, post])).values(),
    );
    const filteredPosts = uniquePosts.filter(
      (post) =>
        !post.is_author_blocked_by_viewer &&
        !post.is_original_author_blocked_by_viewer,
    );
    return filteredPosts.filter((post) => !hiddenPostIds.includes(post.post_id));
  }, [postsData, hiddenPostIds]);

  // Same "was there already cached page data on mount" signal Home Feed
  // uses (index.tsx's FeedPageContent) — this screen's useFeedPosts query
  // key is the exact same feedKeys.list(...) shape a same-community pane in
  // Home Feed already uses, so revisiting a community (or having browsed
  // its Home Feed pane first) serves this instantly from cache. Passed
  // through as imagesAssumeCached below so each post's own images skip
  // their loading-spinner-overlay frame instead of flashing even though
  // nothing actually needs to reload.
  const hasCachedPosts = (postsData?.pages?.length ?? 0) > 0;

  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);

  // ── Report Community ────────────────────────────────────────────────────
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const reportCommunityMutation = useReportCommunity({
    // The route's own loaded community id — never derived from Discover,
    // Home Feed, or any other screen's state (see Phase 3.1B constraints).
    communityId,
    viewerId: currentUserId ?? null,
  });

  const handleReportCommunity = useCallback(
    (reason: string) => {
      setShowReportModal(false);
      reportCommunityMutation.mutate(reason);
    },
    [reportCommunityMutation],
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const keyExtractor = useCallback((item: PostSummary) => item.post_id, []);

  const renderItem = useCallback(
    ({ item }: { item: PostSummary }) => (
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
        universityDomain={item.university_domain}
        communityId={item.community_id}
        communityName={item.community_name}
        communityAvatarUrl={item.community_avatar_url}
        isVerified={item.is_verified}
        commentCount={item.comment_count}
        voteScore={item.vote_score}
        userVote={item.user_vote}
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
        isAdmin={isAdmin}
        imagesAssumeCached={hasCachedPosts}
        disableCommunityNavigation
      />
    ),
    [isAdmin, hasCachedPosts],
  );

  // ── Render states ────────────────────────────────────────────────────────
  if (isCommunityPending) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={["top"]}
      >
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!community) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={["top"]}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={moderateScale(8)}
            style={styles.headerButton}
          >
            <Ionicons name="arrow-back" size={moderateScale(24)} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Community</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
            This community no longer exists.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const headerSection = (
    <View style={{ opacity: isHeaderReady ? 1 : 0 }}>
      <View style={[styles.communityCard, { backgroundColor: theme.card }]}>
        <View testID="community-profile-top-row" style={styles.profileTopRow}>
          <View style={styles.profileTextColumn}>
            <Text style={[styles.communityName, { color: theme.text }]}>
              {community.name}
            </Text>

            <Text style={[styles.communityMemberCount, { color: theme.secondaryText }]}>
              {formatMemberCount(community.member_count)}
            </Text>

            {community.description ? (
              <Text
                style={[
                  styles.communityDescription,
                  { color: theme.secondaryText },
                ]}
              >
                {community.description}
              </Text>
            ) : null}
          </View>

          <View style={[styles.avatar, { backgroundColor: theme.background }]}>
            {community.avatar_url ? (
              <SupabaseImage
                path={community.avatar_url}
                bucket="post-images"
                version={community.updated_at}
                style={styles.avatarImage}
                onLoad={reportHeaderReady}
              />
            ) : (
              <EntityAvatar
                descriptor={getAvatarForEntity("community", {
                  communityAvatarUrl: community.avatar_url,
                  communityName: community.name,
                })}
                style={styles.avatarImage}
                onLoad={reportHeaderReady}
              />
            )}
          </View>
        </View>

        <Pressable
          testID="community-join-leave-button"
          onPress={handleToggleMembership}
          style={[
            styles.joinButton,
            isMember
              ? { backgroundColor: theme.background, borderColor: theme.border }
              : { backgroundColor: theme.primary, borderColor: theme.primary },
          ]}
        >
          <Text
            style={[
              styles.joinButtonText,
              { color: isMember ? theme.text : "#fff" },
            ]}
          >
            {isMember ? "Leave Community" : "Join Community"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <Text style={[styles.postsLabel, { color: theme.secondaryText }]}>Posts</Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={moderateScale(8)}
          style={styles.headerButton}
        >
          <Ionicons name="arrow-back" size={moderateScale(24)} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {community.name}
        </Text>
        <Pressable
          testID="community-menu-button"
          onPress={() => setShowMenu(true)}
          hitSlop={moderateScale(8)}
          style={styles.headerButton}
        >
          <Entypo name="dots-three-horizontal" size={moderateScale(20)} color={theme.text} />
        </Pressable>
      </View>

      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setShowReportModal(true);
              }}
            >
              <MaterialCommunityIcons name="flag" size={moderateScale(20)} color={theme.text} />
              <Text style={[styles.menuText, { color: theme.text }]}>
                Report Community
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReportCommunity}
        isLoading={reportCommunityMutation.isPending}
        reportType="community"
      />

      <FlatList
        testID="community-posts-list"
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={headerSection}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + verticalScale(24) },
        ]}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        onRefresh={refetchPosts}
        refreshing={isRefetchingPosts}
        removeClippedSubviews
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isPostsPending ? (
            <View style={styles.postsLoading}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                No posts yet.
              </Text>
            </View>
          )
        }
      />

      <FullscreenImageModal
        visible={Boolean(fullscreenUri)}
        uri={fullscreenUri}
        onClose={() => setFullscreenUri(null)}
      />

      {canManage ? (
        <Pressable
          testID="community-settings-fab"
          onPress={() => router.push(`/communities/${communityId}/manage`)}
          style={[
            styles.fab,
            styles.settingsFab,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              bottom: insets.bottom + verticalScale(92),
            },
          ]}
        >
          <Ionicons name="settings-outline" size={fabIconSize} color={theme.text} />
        </Pressable>
      ) : null}

      <Pressable
        testID="community-create-post-fab"
        onPress={() => router.push(`/create-post?communityId=${communityId}`)}
        style={[
          styles.fab,
          { backgroundColor: theme.primary, bottom: insets.bottom + verticalScale(20) },
        ]}
      >
        <FontAwesome name="plus" size={fabIconSize} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    padding: moderateScale(4),
    minWidth: scale(36),
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: moderateScale(17),
    fontFamily: "Poppins_600SemiBold",
    marginHorizontal: scale(8),
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: verticalScale(80),
    paddingHorizontal: scale(32),
  },
  emptyText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  // No horizontal padding here (unlike the old layout) — PostListItem rows
  // and the divider below need to reach the true screen edges, matching
  // every other feed in the app (Home Feed's own FlatList has no outer
  // horizontal padding either; PostListItem already carries its own
  // internal paddingHorizontal). Elements that should look like an inset
  // "card" (communityCard, postsLabel) apply their own marginHorizontal
  // instead of relying on the container.
  listContent: {
    paddingTop: verticalScale(12),
  },
  communityCard: {
    borderRadius: moderateScale(16),
    padding: moderateScale(18),
    marginHorizontal: scale(16),
    marginBottom: verticalScale(16),
  },
  profileTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  profileTextColumn: {
    flex: 1,
    flexShrink: 1,
    marginRight: scale(16),
  },
  avatar: {
    width: scale(150),
    height: scale(150),
    borderRadius: moderateScale(75),
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  communityName: {
    fontSize: moderateScale(20),
    fontFamily: "Poppins_700Bold",
    textAlign: "left",
  },
  communityMemberCount: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
    textAlign: "left",
    marginTop: verticalScale(4),
  },
  communityDescription: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
    textAlign: "left",
    marginTop: verticalScale(6),
    lineHeight: moderateScale(20),
  },
  joinButton: {
    width: "100%",
    marginTop: verticalScale(18),
    paddingVertical: verticalScale(9),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: verticalScale(40),
  },
  joinButtonText: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_600SemiBold",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: verticalScale(12),
  },
  postsLabel: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: scale(16),
    marginBottom: verticalScale(8),
  },
  postsLoading: {
    paddingTop: verticalScale(40),
    alignItems: "center",
  },
  footer: {
    paddingVertical: verticalScale(16),
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    borderRadius: moderateScale(12),
    padding: moderateScale(8),
    minWidth: scale(200),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: verticalScale(2),
    },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(3.84),
    elevation: 5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: moderateScale(12),
    gap: moderateScale(12),
  },
  menuText: {
    fontSize: moderateScale(16),
    fontFamily: "Poppins_500Medium",
  },
  // Mirrors the Home Feed's own FAB styling exactly (src/app/(protected)/
  // (tabs)/index.tsx) — same size/shadow/spacing, so Create/Manage floating
  // buttons feel identical across both screens. `bottom` is supplied inline
  // per-button (insets.bottom-aware, since this is a stacked screen with no
  // tab bar underneath, unlike the Home Feed).
  fab: {
    position: "absolute",
    right: scale(20),
    minWidth: scale(60),
    minHeight: verticalScale(60),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(999),
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
  settingsFab: {
    borderWidth: 1,
  },
});
