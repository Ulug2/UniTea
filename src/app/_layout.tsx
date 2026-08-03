import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot, useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import {
  Animated,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Asset } from "expo-asset";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { FontScaleProvider } from "../context/FontScaleContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { hideSplashSafe } from "../utils/splash";
import { initSentry } from "../utils/sentry";
import { logger } from "../utils/logger";
import ErrorBoundary from "../components/ErrorBoundary";
import {
  seedLostFoundCacheFromStorage,
  seedCampusFeedCacheFromStorage,
  seedCommunityFeedCacheFromStorage,
  seedPollCachesForPosts,
  seedChatCacheFromStorage,
  seedChatMessagesCacheFromStorage,
  seedUserPostsCacheFromStorage,
  seedUserTotalVotesCacheFromStorage,
} from "../utils/feedPersistence";
import { moderateScale, scale, verticalScale } from "../utils/scaling";
import { preloadUniversityAvatars } from "../config/universityBranding";
import { fetchBlockRecords } from "../hooks/useBlocks";
import { getAvatarUri } from "../utils/avatarUri";
import { patchGlobalTextScaling } from "../utils/textScaling";

// Must run before anything renders a <Text>/<TextInput> — see textScaling.tsx
// for why the old `Text.defaultProps.maxFontSizeMultiplier` assignment never
// actually worked (React 19's automatic JSX runtime never reads defaultProps).
patchGlobalTextScaling();

// Initialize Sentry before anything else
initSentry();

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const POSTS_PER_PAGE = 10;

// Prefetch initial data for authenticated users
async function prefetchInitialData(userId: string, queryClient: any) {
  try {
    // Fetch profile first so we can scope the feed query by university
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*, university:universities(name, domain)")
      .eq("id", userId)
      .single();

    if (profileData) {
      queryClient.setQueryData(["profile", userId], profileData);
      queryClient.setQueryData(["current-user-profile", userId], profileData);
    }

    const universityId = profileData?.university_id;

    // Prefetch feed posts (default "new" filter), scoped to university.
    // This seeds the Campus Feed cache key below (communityId === null), so
    // it must apply the same community_id IS NULL constraint useFeedPosts
    // does for Campus — otherwise a recent community post can be seeded
    // into Campus Feed's cache until the next manual refresh replaces it.
    let feedQuery = (supabase as any)
      .from("posts_summary_view")
      .select("*")
      .eq("post_type", "feed")
      .or("is_banned.is.null,is_banned.eq.false")
      .is("community_id", null);

    if (universityId) {
      feedQuery = feedQuery.eq("university_id", universityId);
    }

    feedQuery = feedQuery
      .order("created_at", { ascending: false })
      .range(0, POSTS_PER_PAGE - 1);

    const { data: feedData } = await feedQuery;

    if (feedData) {
      // Campus Feed key includes communityId === null (see feedKeys.list).
      // Only seed the "new" key here — this fetch is sorted by created_at
      // with no hot_score ordering or 7-day window, so it is NOT valid
      // placeholder data for "hot". Seeding it under the hot key too used to
      // cause a flash of New-shaped posts in the Hot tab on cold start,
      // followed by the real (possibly empty) hot-filtered result replacing
      // it once the background refetch resolved.
      queryClient.setQueryData(
        ["posts", "feed", "new", "", universityId, null],
        {
          pages: [feedData],
          pageParams: [0],
        }
      );
    }

    // Prefetch blocked users — via the exact same function useBlocks() uses,
    // so this cache entry can never drift out of the BlockRecord[] shape
    // every consumer (isBlockedPost, isBlockedChat, isBlockedDirectMessage)
    // expects. Previously this reimplemented the fetch independently and
    // wrote a flat string[] instead — whichever write landed last (this one,
    // or useBlocks()'s own fetch) determined whether block filtering worked
    // at all for up to staleTime, since every isBlockedX() check silently
    // evaluates to false against a string[] (Phase 7.2 fix).
    const blockRecords = await fetchBlockRecords(userId);
    queryClient.setQueryData(["blocks", userId], blockRecords);

    return profileData ?? null;
  } catch (error) {
    logger.error("[Prefetch] Error prefetching initial data", error as Error);
    return null;
  }
}

function RootLayoutContent() {
  const isAndroid = Platform.OS === "android";
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const { loading: authLoading, session, persistProfile, cachedProfile } = useAuth();
  const queryClient = useQueryClient();
  const { theme, isDark } = useTheme();

  // Controls the JS splash replica overlay that bridges native->RN handoff.
  const [splashVisible, setSplashVisible] = useState(isAndroid);
  const [splashAssetReady, setSplashAssetReady] = useState(!isAndroid);
  const [startupReadyToHideSplash, setStartupReadyToHideSplash] = useState(false);
  const didStartSplashHide = useRef(false);

  // Keep Android system areas (including gesture/nav region) aligned with the
  // tab surface color so the bottom inset blends with the tab bar.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    SystemUI.setBackgroundColorAsync(theme.card).catch(() => {
      // Non-fatal: UI still renders even if the platform ignores this call.
    });
  }, [theme.card]);

  // Gates <Slot /> from rendering until the AsyncStorage seed has been written
  // into the RQ cache. Without this, useEffect fires AFTER the first render,
  // meaning tab hooks call useInfiniteQuery with an empty cache (isPending=true →
  // skeleton) before seedLostFoundCacheFromStorage has a chance to run.
  const [cacheReady, setCacheReady] = useState(false);

  // Android replica starts fully visible, then fades out once native splash is hidden.
  const fadeAnim = useRef(new Animated.Value(1)).current;
  // Smoothly reveal app content on both iOS and Android.
  const appFadeAnim = useRef(new Animated.Value(0)).current;

  const fadeOutSplashReplica = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSplashVisible(false);
      }
    });
  };

  const fadeInApp = () => {
    Animated.timing(appFadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  // Warm bundled university avatars before any screen renders them.
  useEffect(() => {
    void preloadUniversityAvatars();
  }, []);

  // App icon badge is set by (protected)/(tabs)/_layout.tsx from globalUnreadCount when logged in.
  // Do not reset badge here so the correct unread count is preserved.

  // Prefetch data when user is authenticated and fonts are loaded
  useEffect(() => {
    if (fontsLoaded && !authLoading && session?.user?.id) {
      (async () => {
        if (isAndroid) {
          try {
            await Asset.loadAsync(require("../../assets/splash-icon.png"));
          } catch (error) {
            logger.error(
              "[Splash] Failed to preload splash replica asset",
              error as Error
            );
          }
          setSplashAssetReady(true);
        }

        // 1. Seed the RQ cache from AsyncStorage first (fast, ~5-50ms).
        //    This must complete BEFORE setCacheReady(true) so that when <Slot />
        //    renders, useInfiniteQuery/useQuery already finds data in cache (isPending=false).
        //    cachedProfile?.university_id is the previous session's AsyncStorage-
        //    persisted profile (see AuthContext), already hydrated by this point —
        //    it's what lets the Lost & Found seed below use a correctly-scoped key
        //    without waiting on the network profile fetch below. On a brand-new
        //    login with no prior cached profile it's undefined and the seed is a
        //    no-op, same as any first visit.
        const [, campusFeedPostIds, communityFeedPostIds] = await Promise.all([
          seedLostFoundCacheFromStorage(queryClient, cachedProfile?.university_id),
          seedCampusFeedCacheFromStorage(queryClient, cachedProfile?.university_id),
          seedCommunityFeedCacheFromStorage(queryClient, cachedProfile?.university_id),
          seedChatCacheFromStorage(queryClient, session.user.id),
          seedChatMessagesCacheFromStorage(queryClient, session.user.id),
          seedUserPostsCacheFromStorage(queryClient, session.user.id),
          seedUserTotalVotesCacheFromStorage(queryClient, session.user.id),
          preloadUniversityAvatars(),
        ]);

        // 1b. Poll data can't be seeded until we know which posts the Campus
        //     and community feed seeds above actually contain
        //     (posts_summary_view carries no has-a-poll flag) — see
        //     feedPersistence.ts's seedPollCachesForPosts. Still runs before
        //     setCacheReady(true) below, same as every other seed here.
        await seedPollCachesForPosts(
          queryClient,
          [...(campusFeedPostIds ?? []), ...(communityFeedPostIds ?? [])],
          session.user.id,
        );

        // 2. Ungate <Slot />. The Animated.View still has opacity:0 so the user
        //    sees nothing, but hooks now run against the pre-seeded cache.
        setCacheReady(true);

        // 3. Hide the native splash as soon as local seeding is done — do NOT
        //    await network prefetch here. Awaiting prefetchInitialData made cold
        //    starts (e.g. universal link to /post/:id after force-quit) sit on the
        //    splash for feed + blocks + profile round-trips the user never waited
        //    for. Fresh data still loads via prefetch and query refetch.
        setStartupReadyToHideSplash(true);

        void (async () => {
          try {
            const profileData = await prefetchInitialData(
              session.user.id,
              queryClient
            );

            if (profileData) {
              await persistProfile({
                avatar_url: profileData.avatar_url ?? null,
                username: profileData.username ?? null,
                university_domain: profileData.university?.domain ?? null,
                university_name: profileData.university?.name ?? null,
                university_id: profileData.university_id ?? null,
              });

              if (profileData.avatar_url) {
                // Must match the exact URL FlippableAvatar/CachedAvatar/EntityAvatar
                // request (including the ?v= cache-busting param) — expo-image's
                // disk cache keys purely on the URL string, so a mismatched prefetch
                // URL silently warms a cache entry that's never read (Phase 7.2).
                ExpoImage.prefetch(
                  getAvatarUri(profileData.avatar_url, profileData.updated_at),
                );
              }
            }
          } catch (error) {
            logger.error(
              "[Prefetch] Background initial prefetch failed",
              error as Error
            );
          }
        })();
      })();
    } else if (fontsLoaded && !authLoading && !session) {
      (async () => {
        if (isAndroid) {
          try {
            await Asset.loadAsync(require("../../assets/splash-icon.png"));
          } catch (error) {
            logger.error(
              "[Splash] Failed to preload splash replica asset",
              error as Error
            );
          }
          setSplashAssetReady(true);
        }

        // No user session — nothing to seed; ungate <Slot /> immediately so the
        // login screen can render, then hide the splash.
        setCacheReady(true);
        setStartupReadyToHideSplash(true);
      })();
    }
  }, [fontsLoaded, authLoading, session, queryClient, persistProfile, isAndroid]);

  // Hide native splash only after startup work is done AND the Android JS
  // splash image is confirmed drawable. This removes the brief teal-only gap
  // between native phase 2 and JS phase 3.
  useEffect(() => {
    if (!startupReadyToHideSplash || !splashAssetReady) return;
    if (didStartSplashHide.current) return;
    didStartSplashHide.current = true;

    (async () => {
      await hideSplashSafe();
      if (isAndroid) {
        fadeOutSplashReplica();
      }
      fadeInApp();
    })().catch(() => {
      // Error already handled in hideSplashSafe, just prevent unhandled rejection
    });
  }, [startupReadyToHideSplash, splashAssetReady, isAndroid]);

  // <Slot /> must not mount before fonts, auth, and the AsyncStorage cache
  // seed are all ready — this prevents skeleton flashes on cold starts.
  // The SplashOverlay covers the screen until the very last moment, so we
  // no longer need an early null-return; instead we gate only the Slot.
  const appReady = fontsLoaded && !authLoading && cacheReady;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor:
          Platform.OS === "android" ? theme.card : theme.background,
      }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      {appReady && <Animated.View style={{ flex: 1, opacity: appFadeAnim }}><Slot /></Animated.View>}
      {isAndroid && splashVisible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.splashReplicaOverlay,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <Image
            source={require("../../assets/splash-icon.png")}
            style={styles.splashReplicaIcon}
            resizeMode="contain"
          />
        </Animated.View>
      )}
    </View>
  );
}

function RecoveryFallback() {
  const router = useRouter();
  return (
    <View style={recoveryStyles.container}>
      <Text style={recoveryStyles.title}>Something went wrong</Text>
      <Pressable
        style={recoveryStyles.button}
        onPress={() => router.replace("/(protected)/(tabs)")}
      >
        <Text style={recoveryStyles.buttonText}>Open feed</Text>
      </Pressable>
    </View>
  );
}

const recoveryStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: moderateScale(24),
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: moderateScale(18),
    marginBottom: verticalScale(24),
    textAlign: "center",
  },
  button: {
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(24),
    borderRadius: moderateScale(8),
    backgroundColor: "#2FC9C1",
  },
  buttonText: {
    color: "#fff",
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
});

const styles = StyleSheet.create({
  splashReplicaOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2FC9C1",
  },
  splashReplicaIcon: {
    width: scale(200),
    height: verticalScale(200),
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary fallback={<RecoveryFallback />}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <FontScaleProvider>
              <AuthProvider>
                <RootLayoutContent />
              </AuthProvider>
            </FontScaleProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
