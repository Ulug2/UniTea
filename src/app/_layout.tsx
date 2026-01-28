import { Slot } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { ThemeProvider } from "../context/ThemeContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";
import * as SplashScreen from "expo-splash-screen";

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
    console.error("[Prefetch] Error prefetching initial data:", error);
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

  // Prefetch data when user is authenticated and fonts are loaded
  useEffect(() => {
    if (fontsLoaded && !authLoading && session?.user?.id) {
      // Prefetch data and then hide splash screen
      (async () => {
        await prefetchInitialData(session.user.id, queryClient);
        // Hide splash screen after prefetch completes
        await SplashScreen.hideAsync();
      })();
    } else if (fontsLoaded && !authLoading && !session) {
      // No user session - hide splash screen immediately
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authLoading, session, queryClient]);

  // Don't render anything until fonts are loaded and auth is initialized
  if (!fontsLoaded || authLoading) {
    return null;
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RootLayoutContent />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
