import { AntDesign, Entypo, MaterialIcons } from "@expo/vector-icons";
import { Stack, router, usePathname, useSegments } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from '../../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

export default function AppLayout() {
    const { theme } = useTheme();
    const { session, loading } = useAuth();

    useEffect(() => {
        if (!loading && !session) {
            router.replace('/(auth)');
        }
    }, [session, loading]);

    // Handle deep links
    useEffect(() => {
        // Handle initial URL (app opened via deep link)
        const handleInitialURL = async () => {
            const initialUrl = await Linking.getInitialURL();
            if (initialUrl) {
                handleDeepLink(initialUrl);
            }
        };

        // Handle URL changes (app already open, new deep link received)
        const subscription = Linking.addEventListener('url', (event) => {
            handleDeepLink(event.url);
        });

        handleInitialURL();

        return () => {
            subscription.remove();
        };
    }, [session, loading]);

    const handleDeepLink = (url: string) => {
        if (!session || loading) {
            // Wait for auth to complete
            return;
        }

        try {
            // Parse URL: myplov://post/{postId}
            const parsed = Linking.parse(url);
            console.log('Deep link parsed:', parsed);
            
            // Handle format: myplov://post/{postId}
            if (parsed.path) {
                const pathParts = parsed.path.split('/').filter(Boolean);
                
                if (pathParts[0] === 'post' && pathParts[1]) {
                    const postId = pathParts[1];
                    console.log('Navigating to post:', postId);
                    router.push(`/post/${postId}`);
                }
            }
        } catch (error) {
            console.error('Error handling deep link:', error);
        }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={theme.primary} />
            </View>
        );
    }

    return (
        <Stack screenOptions={{
            animation: 'fade',
        }}>
            <Stack.Screen name="(tabs)" options={{
                headerShown: false,
            }} />
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
    )
}