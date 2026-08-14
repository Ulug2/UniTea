import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import CustomInput from "../../../components/CustomInput";
import CommunityListSkeleton from "../../../components/CommunityListSkeleton";
import { useTheme } from "../../../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import { useUniversityCommunities } from "../../../features/communities/hooks/useUniversityCommunities";
import { useMyCommunities } from "../../../features/communities/hooks/useMyCommunities";
import {
  useJoinCommunity,
  useLeaveCommunity,
} from "../../../features/communities/hooks/useCommunityMembership";
import CommunityDirectoryItem from "../../../features/communities/components/CommunityDirectoryItem";
import { useRevealAfterFirstNImages } from "../../../hooks/useRevealAfterFirstNImages";
import { prefetchCommunityDetail } from "../../../features/communities/data/communityDetailQuery";
import type { CommunityDirectoryEntry } from "../../../features/communities/types";

// Roughly one phone screen's worth of rows — matches Task 5's "first ~8-9
// communities" target. Only these get wired to the reveal gate; rows
// further down render/load normally without holding up the reveal.
const REVEAL_GATE_ROW_COUNT = 9;

export default function CommunityDirectoryScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const fontScale = PixelRatio.getFontScale();
  const fabIconSize = moderateScale(28) * fontScale;
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the server-side name search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    communities,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isInitialLoading,
    isProfileFetched,
    universityId,
    isError,
    refetch,
    isRefetching,
  } = useUniversityCommunities(search);

  const { joinedIds, isPending: isMyCommunitiesPending } = useMyCommunities();
  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Skip the reveal-wait when both the directory AND the membership state
  // are already warm (prefetched on Discover tap, or a same-session
  // revisit) — same "nothing to wait for" reasoning as Lost & Found's list
  // screen, extended to also require membership so Join/Leave never flips
  // after the row is already visible (mirrors Chat List's own two-source
  // coordination: chatSummaries + chat-users). No resetKey needed: unlike
  // the Home Feed's community-switcher, this screen has no equivalent
  // "switch to a different cached list" case.
  const hasCachedCommunities = communities.length > 0 && !isMyCommunitiesPending;
  const { shouldReveal, onItemReady } = useRevealAfterFirstNImages({
    minItems: 3,
    timeoutMs: 2500,
    initialRevealed: hasCachedCommunities,
  });

  const handleToggleMembership = useCallback(
    async (community: CommunityDirectoryEntry, isMember: boolean) => {
      setBusyId(community.id);
      try {
        if (isMember) {
          await leaveMutation.mutateAsync(community.id);
        } else {
          await joinMutation.mutateAsync(community);
        }
      } catch {
        // Errors surfaced via mutation onError.
      } finally {
        setBusyId(null);
      }
    },
    [joinMutation, leaveMutation],
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const keyExtractor = useCallback((item: CommunityDirectoryEntry) => item.id, []);

  // Prefetches the exact query the Community View screen itself runs, then
  // navigates — mirrors PostListItem's/LostFoundListItem's prefetch-on-tap
  // pattern (Phase 7.8 / Phase 2) so React Query dedupes the prefetch
  // against the destination screen's own useCommunity() call.
  const handleOpenCommunity = useCallback(
    (community: CommunityDirectoryEntry) => {
      prefetchCommunityDetail(queryClient, community.id);
      router.push(`/communities/${community.id}`);
    },
    [queryClient],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CommunityDirectoryEntry; index: number }) => (
      <CommunityDirectoryItem
        community={item}
        isMember={joinedIds.has(item.id)}
        isBusy={busyId === item.id}
        onToggleMembership={handleToggleMembership}
        onPress={handleOpenCommunity}
        onImageLoad={index < REVEAL_GATE_ROW_COUNT ? onItemReady : undefined}
      />
    ),
    [joinedIds, busyId, handleToggleMembership, handleOpenCommunity, onItemReady],
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={moderateScale(8)}
          style={styles.headerButton}
        >
          <Ionicons name="arrow-back" size={moderateScale(24)} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Communities
        </Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.searchHeader}>
        <CustomInput
          placeholder="Search communities..."
          value={searchInput}
          onChangeText={setSearchInput}
          leftIcon={{ type: "font-awesome", name: "search" }}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>

      {isInitialLoading ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          <CommunityListSkeleton />
        </ScrollView>
      ) : isProfileFetched && !universityId ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
            Your account is not linked to a university yet.
          </Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
            Couldn't load communities.
          </Text>
          <Pressable onPress={() => refetch()} style={styles.retryButton}>
            <Text style={[styles.retryText, { color: theme.primary }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              opacity: shouldReveal ? 1 : 0,
              pointerEvents: shouldReveal ? "auto" : "none",
            }}
          >
            <FlatList
              data={communities}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              initialNumToRender={REVEAL_GATE_ROW_COUNT}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + verticalScale(24) },
              ]}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              onRefresh={refetch}
              refreshing={isRefetching}
              removeClippedSubviews
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View style={styles.footer}>
                    <ActivityIndicator size="small" color={theme.primary} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                    {search
                      ? "No communities match your search."
                      : "No communities yet. Be the first to create one!"}
                  </Text>
                </View>
              }
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
                contentContainerStyle={styles.listContent}
              >
                <CommunityListSkeleton />
              </ScrollView>
            </View>
          )}
        </View>
      )}

      <Pressable
        onPress={() => router.push("/communities/create")}
        style={[
          styles.fab,
          {
            backgroundColor: theme.primary,
            bottom: insets.bottom + verticalScale(20),
          },
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
  },
  headerButton: {
    padding: moderateScale(4),
    minWidth: scale(36),
    alignItems: "center",
  },
  headerTitle: {
    fontSize: moderateScale(20),
    fontFamily: "Poppins_600SemiBold",
  },
  searchHeader: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(4),
  },
  searchInput: {
    marginBottom: verticalScale(8),
  },
  listContent: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(4),
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
  retryButton: {
    marginTop: verticalScale(12),
  },
  retryText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_600SemiBold",
  },
  footer: {
    paddingVertical: verticalScale(16),
    alignItems: "center",
  },
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
});
