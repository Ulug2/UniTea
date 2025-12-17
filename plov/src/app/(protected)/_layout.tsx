import { AntDesign, Entypo, MaterialIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from '../../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { useEffect } from 'react';

export default function AppLayout() {
    const { theme } = useTheme();
    const { session, loading } = useAuth();

    useEffect(() => {
        if (!loading && !session) {
            router.replace('/(auth)');
        }
    }, [session, loading]);

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