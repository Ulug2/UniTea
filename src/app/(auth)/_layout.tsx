import { Stack } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { router } from 'expo-router';
import { useEffect } from 'react';

export default function AuthLayout() {
    const { theme } = useTheme();
    const { session, loading } = useAuth();

    useEffect(() => {
        if (!loading && session) {
            router.replace('/(protected)/(tabs)');
        }
    }, [session, loading]);

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.primary} size="large" />
            </View>
        );
    }

    return (
        <Stack screenOptions={{
            headerShown: false,
            animation: 'fade',
        }}>
            <Stack.Screen name="index" />
        </Stack>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
