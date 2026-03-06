import { Slot, useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { Animated, View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import * as SplashScreen from "expo-splash-screen";
import { hideSplashSafe } from "../utils/splash";
import { initSentry } from "../utils/sentry";
import { logger } from "../utils/logger";
import ErrorBoundary from "../components/ErrorBoundary";
import {
  seedQueryCacheFromStorage,
  seedChatCacheFromStorage,
  seedUserPostsCacheFromStorage,
  seedUserTotalVotesCacheFromStorage,
} from "../utils/feedPersistence";

// Initialize Sentry before anything else
initSentry();

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const POSTS_PER_PAGE = 10;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

// Prefetch initial data for authenticated users
async function prefetchInitialData(userId: string, queryClient: any) {
  try {
    // Prefetch feed posts (default "new" filter)
    const feedQuery = (supabase as any)
      .from("posts_summary_view")
      .select("*")
      .eq("post_type", "feed")
      .or("is_banned.is.null,is_banned.eq.false")
      .order("created_at", { ascending: false })
      .range(0, POSTS_PER_PAGE - 1);

    const { data: feedData } = await feedQuery;

    if (feedData) {
      // Seed "new" with fresh data (full staleTime applies).
      queryClient.setQueryData(["posts", "feed", "new"], {
        pages: [feedData],
        pageParams: [0],
      });

      // Seed "hot" with the same data marked stale (updatedAt:0) so the default
      // visible tab never shows a skeleton. The "hot" useInfiniteQuery sees data
      // (isPending=false) and immediately fires a background refetch with the
      // proper 7-day / 100-post query, replacing the placeholder seamlessly.
      if (!queryClient.getQueryData(["posts", "feed", "hot"])) {
        queryClient.setQueryData(
          ["posts", "feed", "hot"],
          { pages: [feedData], pageParams: [0] },
          { updatedAt: 0 },
        );
      }
    }

    // Prefetch blocked users
    const [blockedByMe, blockedMe] = await Promise.all([
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId),
      supabase.from("blocks").select("blocker_id").eq("blocked_id", userId),
    ]);

    const blockedUserIds = new Set<string>();
    blockedByMe.data?.forEach((b) => blockedUserIds.add(b.blocked_id));
    blockedMe.data?.forEach((b) => blockedUserIds.add(b.blocker_id));

    queryClient.setQueryData(["blocks", userId], Array.from(blockedUserIds));

    // Prefetch user profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileData) {
      queryClient.setQueryData(["profile", userId], profileData);
    }

    // Return profile so the caller can persist it and warm the avatar disk cache.
    return profileData ?? null;
  } catch (error) {
    logger.error("[Prefetch] Error prefetching initial data", error as Error);
    // Don't throw - prefetch failures shouldn't block app startup
    return null;
  }
}

function RootLayoutContent() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold,
  });
  const { loading: authLoading, session, persistProfile } = useAuth();
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  // Gates <Slot /> from rendering until the AsyncStorage seed has been written
  // into the RQ cache. Without this, useEffect fires AFTER the first render,
  // meaning tab hooks call useInfiniteQuery with an empty cache (isPending=true →
  // skeleton) before seedQueryCacheFromStorage has a chance to run.
  const [cacheReady, setCacheReady] = useState(false);

  // Animated opacity for the fade-in transition after splash screen hides
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fadeInAfterSplash = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  // App icon badge is set by (protected)/(tabs)/_layout.tsx from globalUnreadCount when logged in.
  // Do not reset badge here so the correct unread count is preserved.

  // Prefetch data when user is authenticated and fonts are loaded
  useEffect(() => {
    if (fontsLoaded && !authLoading && session?.user?.id) {
      (async () => {
        // 1. Seed the RQ cache from AsyncStorage first (fast, ~5-50ms).
        //    This must complete BEFORE setCacheReady(true) so that when <Slot />
        //    renders, useInfiniteQuery/useQuery already finds data in cache (isPending=false).
        await Promise.all([
          seedQueryCacheFromStorage(queryClient),
          seedChatCacheFromStorage(queryClient, session.user.id),
          seedUserPostsCacheFromStorage(queryClient, session.user.id),
          seedUserTotalVotesCacheFromStorage(queryClient, session.user.id),
        ]);

        // 2. Ungate <Slot />. The Animated.View still has opacity:0 so the user
        //    sees nothing, but hooks now run against the pre-seeded cache.
        setCacheReady(true);

        // 3. Fetch fresh data in the background. prefetchInitialData overwrites
        //    the "new" feed slot with the latest posts from the network.
        const profileData = await prefetchInitialData(session.user.id, queryClient);

        if (profileData) {
          // Persist the profile for the next cold start.
          await persistProfile({
            avatar_url: profileData.avatar_url ?? null,
            username: profileData.username ?? null,
          });

          // Warm the expo-image disk cache so the avatar is ready before the
          // profile screen mounts.
          if (profileData.avatar_url) {
            const avatarUrl = profileData.avatar_url.startsWith("http")
              ? profileData.avatar_url
              : `${SUPABASE_URL}/storage/v1/object/public/avatars/${profileData.avatar_url}`;
            Image.prefetch(avatarUrl);
          }
        }

        await hideSplashSafe();
        fadeInAfterSplash();
      })();
    } else if (fontsLoaded && !authLoading && !session) {
      // No user session — nothing to seed; ungate <Slot /> immediately so the
      // login screen can render, then hide the splash.
      setCacheReady(true);
      (async () => {
        await hideSplashSafe();
        fadeInAfterSplash();
      })().catch(() => {
        // Error already handled in hideSplashSafe, just prevent unhandled rejection
      });
    }
  }, [fontsLoaded, authLoading, session, queryClient, persistProfile]);

  // Don't render anything until fonts, auth, and the AsyncStorage cache seed
  // are all ready. cacheReady ensures <Slot /> never mounts before the RQ cache
  // is pre-populated, eliminating the skeleton flash on cold starts.
  if (!fontsLoaded || authLoading || !cacheReady) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <Slot />
      </Animated.View>
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
    padding: 24,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 18,
    marginBottom: 24,
    textAlign: "center",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#2FC9C1",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default function RootLayout() {
  return (
    <ErrorBoundary fallback={<RecoveryFallback />}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <RootLayoutContent />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
