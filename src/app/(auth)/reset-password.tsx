import { useState } from 'react';
import { View, Text, Alert, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import CustomInput from '../../components/CustomInput';
import { useTheme } from '../../context/ThemeContext';

export default function ResetPasswordScreen() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const { theme } = useTheme();

    async function handleResetPassword() {
        setPasswordError('');

        // Validate inputs
        if (!newPassword.trim()) {
            setPasswordError('Please enter a new password.');
            return;
        }
        if (!confirmPassword.trim()) {
            setPasswordError('Please confirm your new password.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) {
                Alert.alert('Error updating password');
                console.error('Error updating password:', error);
            }
            else {
                Alert.alert(
                    'Password Updated',
                    'Your password has been successfully reset.',
                    [{ text: 'OK', onPress: () => router.replace('/(auth)') }]
                );
            }
        }
        catch (error: any) {
            Alert.alert('Error', 'Failed to reset password. Please try again.');
        }
        finally {
            setLoading(false);
        }
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Text style={[styles.title, { color: theme.text }]}>
                Create New Password
            </Text>
            <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
                Enter your new password below
            </Text>

            <CustomInput
                label="New Password"
                leftIcon={{ type: 'font-awesome', name: 'lock' }}
                onChangeText={setNewPassword}
                value={newPassword}
                secureTextEntry
                placeholder="Enter new password"
                autoCapitalize="none"
                editable={!loading}
            />

            <CustomInput
                label="Confirm Password"
                leftIcon={{ type: 'font-awesome', name: 'lock' }}
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                secureTextEntry
                placeholder="Confirm new password"
                autoCapitalize="none"
                errorMessage={passwordError}
                editable={!loading}
            />
            <Pressable
                style={[
                    styles.button,
                    { backgroundColor: theme.primary },
                    loading && styles.disabledButton,
                ]}
                disabled={loading}
                onPress={handleResetPassword}
            >
                <Text style={styles.buttonText}>
                    {loading ? 'Updating...' : 'Reset Password'}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        marginBottom: 32,
        textAlign: 'center',
    },
    button: {
        marginTop: 16,
        paddingVertical: 16,
        borderRadius: 18,
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    disabledButton: {
        opacity: 0.65,
    },
});