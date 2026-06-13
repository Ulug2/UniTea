import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import CustomInput from "../../../components/CustomInput";
import { useTheme } from "../../../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";
import { useUniversityCommunities } from "../../../features/communities/hooks/useUniversityCommunities";
import { useMyCommunities } from "../../../features/communities/hooks/useMyCommunities";
import {
  useJoinCommunity,
  useLeaveCommunity,
} from "../../../features/communities/hooks/useCommunityMembership";
import CommunityDirectoryItem from "../../../features/communities/components/CommunityDirectoryItem";
import type { CommunityDirectoryEntry } from "../../../features/communities/types";

export default function CommunityDirectoryScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const fontScale = PixelRatio.getFontScale();
  const fabIconSize = moderateScale(28) * fontScale;

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

  const { joinedIds } = useMyCommunities();
  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const renderItem = useCallback(
    ({ item }: { item: CommunityDirectoryEntry }) => (
      <CommunityDirectoryItem
        community={item}
        isMember={joinedIds.has(item.id)}
        isBusy={busyId === item.id}
        onToggleMembership={handleToggleMembership}
      />
    ),
    [joinedIds, busyId, handleToggleMembership],
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
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
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
        <FlatList
          data={communities}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
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
