import { AntDesign, Entypo, MaterialIcons } from "@expo/vector-icons";
import { Stack, router, usePathname, useSegments } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { View } from "react-native";
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useMyProfile } from "../../features/profile/hooks/useMyProfile";
import BannedScreen from "../../components/BannedScreen";
import { FilterProvider } from "../../context/FilterContext";
import { usePushNotifications } from "../../hooks/usePushNotifications";

export default function AppLayout() {
  const { theme } = useTheme();
  const { session, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyProfile(
    session?.user?.id,
  );
  const isBanned =
    profile &&
    (profile.is_permanently_banned === true ||
      (profile.banned_until != null &&
        new Date(profile.banned_until) > new Date()));

  // Ensure notification permission + Expo push token registration + handler
  // setup runs whenever the user is authenticated.
  usePushNotifications();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/(auth)");
    }
  }, [session, loading]);

  // Handle deep links (deferred so tabs mount first; avoids error flash)
  useEffect(() => {
    if (!session || loading) return;

    const handleDeepLink = (url: string) => {
      try {
        const parsed = Linking.parse(url);
        if (!parsed.path) return;

        const pathParts = parsed.path.split("/").filter(Boolean);
        const queryParams = (parsed as any).queryParams ?? {};
        const getQueryParam = (key: string): string | undefined => {
          const v = queryParams[key];
          if (typeof v === "string") return v;
          if (Array.isArray(v)) return v[0];
          return undefined;
        };

        // `Linking.parse()` should provide `queryParams`, but on some platforms
        // it may be missing/empty. Fallback to searching the raw URL string.
        const getQueryParamFromRawUrl = (key: string): string | undefined => {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const m = url.match(new RegExp(`[?&]${escapedKey}=([^&#]+)`));
          if (!m) return undefined;
          try {
            return decodeURIComponent(m[1]);
          } catch {
            return m[1];
          }
        };

        const postType =
          getQueryParam("postType") ||
          getQueryParam("post_type") ||
          getQueryParam("type") ||
          getQueryParamFromRawUrl("postType") ||
          getQueryParamFromRawUrl("post_type") ||
          getQueryParamFromRawUrl("type");

        if (pathParts[0] === "post" && pathParts[1]) {
          // `/post/<id>?postType=lost_found` should open the lost&found detail screen.
          // This keeps universal-link configuration aligned with the existing `/post/*` path.
          if (postType === "lost_found") {
            router.navigate(`/lostfoundpost/${pathParts[1]}?fromDeeplink=1`);
          } else {
            router.navigate(`/post/${pathParts[1]}?fromDeeplink=1`);
          }
        } else if (pathParts[0] === "lostfoundpost" && pathParts[1]) {
          router.navigate(`/lostfoundpost/${pathParts[1]}?fromDeeplink=1`);
        }
      } catch {
        // Silently ignore parse/navigation errors so user never sees alerts
      }
    };

    // Handle URL when app is already open
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    // Handle initial URL after a short delay so feed/tabs render first
    const t = setTimeout(async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) handleDeepLink(initialUrl);
    }, 100);

    return () => {
      clearTimeout(t);
      subscription.remove();
    };
  }, [session, loading]);

  // By the time we get here, auth should already be initialized
  // (splash screen handles the initial loading)
  // Just handle routing based on auth state
  if (!loading && !session) {
    // This will be handled by the useEffect above, but return null to avoid flash
    return null;
  }

  if (session && !profileLoading && isBanned && profile) {
    return (
      <BannedScreen
        isPermanent={profile.is_permanently_banned === true}
        bannedUntil={profile.banned_until}
      />
    );
  }

  return (
    <FilterProvider>
      <Stack
        screenOptions={{
          animation: "fade",
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="create-post"
          options={{
            headerShown: false,
            animation: "slide_from_bottom",
            presentation: "fullScreenModal",
          }}
        />
        <Stack.Screen
          name="post/[id]"
          options={{
            headerTitle: "",
            headerStyle: { backgroundColor: theme.primary },
            headerLeft: () => (
              <AntDesign
                name="close"
                size={24}
                color="white"
                onPress={() => router.back()}
              />
            ),
            headerRight: () => (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Entypo name="dots-three-horizontal" size={24} color="white" />
              </View>
            ),
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{
            headerShown: false,
            animation: "slide_from_right",
            gestureEnabled: true,
            fullScreenGestureEnabled: false,
            // Narrower edge zone so back swipe only triggers from the very edge; reduces conflict with list scrolling
            gestureResponseDistance: { start: 15 },
          }}
        />
        <Stack.Screen
          name="lostfoundpost/[id]"
          options={{
            headerShown: false,
            animation: "slide_from_right",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
      </Stack>
    </FilterProvider>
  );
}
