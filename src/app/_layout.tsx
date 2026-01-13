import { Slot } from "expo-router";
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { ActivityIndicator, View } from "react-native";
import { ThemeProvider } from "../context/ThemeContext";
import { AuthProvider } from '../context/AuthContext';
import { lightTheme } from "../theme";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { useEffect } from 'react';
// import * as Linking from 'expo-linking';
// import { supabase } from '../lib/supabase';

// UNCOMMENT THIS WHEN DEPLOYING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

const queryClient = new QueryClient();

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        Poppins_700Bold,
    });

    // useEffect(() => {
    //     // Handle deep links for email verification
    //     const handleDeepLink = async (event: { url: string }) => {
    //         const { queryParams } = Linking.parse(event.url);

    //         if (queryParams?.access_token && queryParams?.refresh_token) {
    //             try {
    //                 await supabase.auth.setSession({
    //                     access_token: queryParams.access_token as string,
    //                     refresh_token: queryParams.refresh_token as string,
    //                 });
    //             } catch (error) {
    //                 console.error('Error setting session from deep link:', error);
    //             }
    //         }
    //     };

    //     // Check if app was opened with a deep link
    //     Linking.getInitialURL().then((url) => {
    //         if (url) handleDeepLink({ url });
    //     });

    //     // Listen for deep links while app is running
    //     const subscription = Linking.addEventListener('url', handleDeepLink);

    //     return () => {
    //         subscription.remove();
    //     };
    // }, []);

    if (!fontsLoaded) {
        return (
            <View style={{ flex: 1, backgroundColor: lightTheme.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={lightTheme.primary} />
            </View>
        );
    }

    return (
        <QueryClientProvider client={queryClient}>
        <ThemeProvider>
            <AuthProvider>
                <Slot />
            </AuthProvider>
        </ThemeProvider>
        </QueryClientProvider>
    )
}