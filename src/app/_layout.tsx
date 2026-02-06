import { Slot, useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { View, Text, Pressable, StyleSheet, AppState, AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { ThemeProvider } from "../context/ThemeContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import * as SplashScreen from "expo-splash-screen";
import { hideSplashSafe } from "../utils/splash";
import { initSentry } from "../utils/sentry";
import ErrorBoundary from "../components/ErrorBoundary";

// Initialize Sentry before anything else
initSentry();

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const POSTS_PER_PAGE = 10;

// Prefetch initial data for authenticated users
async function prefetchInitialData(userId: string, queryClient: any) {
  try {
    // Prefetch feed posts (default "new" filter)
    const feedQuery = (supabase as any)
      .from("posts_summary_view")
      .select("*")
      .eq("post_type", "feed")
      .order("created_at", { ascending: false })
      .range(0, POSTS_PER_PAGE - 1);

    const { data: feedData } = await feedQuery;

    if (feedData) {
      queryClient.setQueryData(["posts", "feed", "new"], {
        pages: [feedData],
        pageParams: [0],
      });
    }

    // Prefetch blocked users
    const [blockedByMe, blockedMe] = await Promise.all([
      supabase
        .from("blocks")
        .select("blocked_id")
        .eq("blocker_id", userId),
      supabase
        .from("blocks")
        .select("blocker_id")
        .eq("blocked_id", userId),
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
  } catch (error) {
    logger.error("[Prefetch] Error prefetching initial data", error as Error);
    // Don't throw - prefetch failures shouldn't block app startup
  }
}

function RootLayoutContent() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold,
  });
  const { loading: authLoading, session } = useAuth();
  const queryClient = useQueryClient();

  // Reset app icon badge to 0 on app open and when app comes to foreground
  useEffect(() => {
    const resetBadge = async () => {
      try {
        await Notifications.setBadgeCountAsync(0);
      } catch (error) {
        // Silently fail - badge reset is best effort
      }
    };

    // Reset immediately on mount (app open)
    resetBadge();

    // Reset when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        resetBadge();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Prefetch data when user is authenticated and fonts are loaded
  useEffect(() => {
    if (fontsLoaded && !authLoading && session?.user?.id) {
      // Prefetch data and then hide splash screen
      (async () => {
        await prefetchInitialData(session.user.id, queryClient);
        // Hide splash screen after prefetch completes
        await hideSplashSafe();
      })();
    } else if (fontsLoaded && !authLoading && !session) {
      // No user session - hide splash screen immediately
      // Wrap in IIFE to ensure promise is handled even if called without await
      (async () => {
        await hideSplashSafe();
      })().catch(() => {
        // Error already handled in hideSplashSafe, just prevent unhandled rejection
      });
    }
  }, [fontsLoaded, authLoading, session, queryClient]);

  // Don't render anything until fonts are loaded and auth is initialized
  if (!fontsLoaded || authLoading) {
    return null;
  }

  return <Slot />;
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
