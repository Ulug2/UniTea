import React, { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, View, Text, ActivityIndicator, SafeAreaView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import CustomInput from './CustomInput'
import { useTheme } from '../context/ThemeContext'

export default function Auth() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [mode, setMode] = useState<'login' | 'signup'>('login')
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const { theme } = useTheme()

    // const isUniversityEmail = (value: string) =>
    //     value.trim().toLowerCase().endsWith('@nu.edu.kz')
    const isUniversityEmail = (value: string) => true;

    const headline = useMemo(
        () => (mode === 'login' ? 'Sign in' : 'Create your account'),
        [mode]
    )

    const helper = useMemo(
        () =>
            mode === 'login'
                ? 'Use your university email to continue.'
                : 'Join Plov with your @nu.edu.kz address.',
        [mode]
    )

    async function signInWithEmail() {
        if (!isUniversityEmail(email)) {
            Alert.alert('University email required', 'Use your @nu.edu.kz address to sign in.')
            return
        }

        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
        })

        if (error) Alert.alert(error.message)
        setLoading(false)
    }

    async function signUpWithEmail() {
        if (!isUniversityEmail(email)) {
            Alert.alert('Use your campus email', 'Sign up with your @nu.edu.kz mailbox to join Plov.')
            return
        }

        setLoading(true)
        const {
            data: { session },
            error,
        } = await supabase.auth.signUp({
            email: email.trim(),
            password: password,
        })

        if (error) Alert.alert(error.message)
        if (!session) Alert.alert('Please check your inbox for email verification!')
        setLoading(false)
    }

    if (loading) {
        return (
            <View style={[styles.screen, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.screen, { backgroundColor: theme.background }]}>
            <View style={styles.hero}>
                <View style={[styles.logoBadge, { backgroundColor: theme.primary }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={28} color="#fff" />
                </View>
                <Text style={[styles.brandTitle, { color: theme.text }]}>Plov</Text>
                <Text style={[styles.brandSubtitle, { color: theme.secondaryText }]}>
                    Your anonymous university community
                </Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{headline}</Text>
                <Text style={[styles.cardHelper, { color: theme.secondaryText }]}>{helper}</Text>

                <CustomInput
                    label="University Email"
                    leftIcon={{ type: 'font-awesome', name: 'envelope' }}
                    onChangeText={setEmail}
                    value={email}
                    placeholder="your.name@nu.edu.kz"
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <CustomInput
                    label="Password"
                    leftIcon={{ type: 'font-awesome', name: 'lock' }}
                    onChangeText={setPassword}
                    value={password}
                    secureTextEntry={!showPassword}
                    placeholder="Enter your password"
                    autoCapitalize="none"
                    rightElement={
                        <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                            <Ionicons
                                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                size={20}
                                color={theme.secondaryText}
                            />
                        </Pressable>
                    }
                />

                <Pressable
                    style={[
                        styles.primaryButton,
                        { backgroundColor: theme.primary },
                        loading && styles.disabledButton,
                    ]}
                    disabled={loading}
                    onPress={mode === 'login' ? signInWithEmail : signUpWithEmail}
                >
                    <Text style={styles.primaryButtonText}>
                        {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create account'}
                    </Text>
                </Pressable>

                <Text style={[styles.exclusiveNote, { color: theme.secondaryText }]}>
                    Only available for Nazarbayev University students
                </Text>

                <View style={styles.switchRow}>
                    <Text style={{ color: theme.secondaryText }}>
                        {mode === 'login' ? `Don't have an account?` : 'Already a member?'}
                    </Text>
                    <Pressable
                        onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
                        style={styles.switchButton}
                    >
                        <Text style={[styles.switchText, { color: theme.primary }]}>
                            {mode === 'login' ? 'Sign up' : 'Sign in'}
                        </Text>
                    </Pressable>
                </View>
            </View>

            <Text style={[styles.tosText, { color: theme.secondaryText }]}>
                By continuing, you agree to our Terms of Service and Privacy Policy
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 48,
        paddingBottom: 32,
        justifyContent: 'center',
    },
    hero: {
        alignItems: 'center',
        marginBottom: 24,
        gap: 8,
    },
    logoBadge: {
        width: 72,
        height: 72,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    brandTitle: {
        fontSize: 32,
        fontWeight: '700',
    },
    brandSubtitle: {
        fontSize: 15,
        textAlign: 'center',
    },
    card: {
        borderRadius: 28,
        padding: 24,
        gap: 16,
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.08,
        shadowRadius: 28,
        elevation: 4,
    },
    cardTitle: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
    },
    cardHelper: {
        fontSize: 14,
        textAlign: 'center',
    },
    primaryButton: {
        marginTop: 4,
        paddingVertical: 16,
        borderRadius: 18,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    disabledButton: {
        opacity: 0.65,
    },
    exclusiveNote: {
        fontSize: 13,
        textAlign: 'center',
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    switchButton: {
        paddingVertical: 2,
        paddingHorizontal: 4,
    },
    switchText: {
        fontSize: 16,
        fontWeight: '600',
    },
    tosText: {
        marginTop: 24,
        textAlign: 'center',
        fontSize: 12,
        lineHeight: 18,
    },
})