import { AntDesign, Entypo, MaterialIcons } from "@expo/vector-icons";
import { Stack, router, usePathname, useSegments } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { View } from "react-native";
import { useEffect } from "react";
import * as Linking from "expo-linking";

export default function AppLayout() {
  const { theme } = useTheme();
  const { session, loading } = useAuth();

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
        if (pathParts[0] === "post" && pathParts[1]) {
          const postId = pathParts[1];
          router.push(`/post/${postId}?fromDeeplink=1`);
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

  return (
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
          animation: "none",
        }}
      />
      <Stack.Screen
        name="lostfoundpost/[id]"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
    </Stack>
  );
}
