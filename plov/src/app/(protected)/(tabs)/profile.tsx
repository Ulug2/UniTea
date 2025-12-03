import { View, Text, Switch, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useState } from "react";
import { router } from 'expo-router';

export default function ProfileScreen() {
    const { theme, isDark, toggleTheme } = useTheme();
    const [signingOut, setSigningOut] = useState(false);

    async function signOut() {
        setSigningOut(true);
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Sign out error:', error.message);
            setSigningOut(false);
            return;
        }
        router.replace('/(auth)');
    }

    if (signingOut) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: theme.background,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <ActivityIndicator color={theme.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
                <Switch
                    value={isDark}
                    onValueChange={toggleTheme}
                    trackColor={{ false: theme.border, true: theme.primary }}
                    thumbColor={isDark ? '#fff' : '#f4f3f4'}
                />
            </View>

            <Pressable
                style={[
                    styles.signOutButton,
                    { backgroundColor: theme.primary },
                    signingOut && styles.signOutButtonDisabled,
                ]}
                onPress={signOut}
                disabled={signingOut}
            >
                <Text style={[styles.signOutButtonText, { color: theme.text }]}>
                    Sign Out
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    settingLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
    },
    signOutButton: {
        padding: 12,
        borderRadius: 10,
        marginTop: 24,
        alignItems: 'center',
    },
    signOutButtonDisabled: {
        opacity: 0.6,
    },
    signOutButtonText: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
    },
});
