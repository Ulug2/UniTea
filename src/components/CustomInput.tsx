import React, { ReactNode } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface CustomInputProps extends TextInputProps {
    label?: string;
    leftIcon?: { type: string; name: string };
    errorMessage?: string;
    rightElement?: ReactNode;
}

export default function CustomInput({
    label,
    leftIcon,
    errorMessage,
    style,
    rightElement,
    ...textInputProps
}: CustomInputProps) {
    const { theme, isDark } = useTheme();

    return (
        <View style={styles.container}>
            {label && (
                <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
            )}
            <View
                style={[
                    styles.inputContainer,
                    {
                        backgroundColor: theme.card,
                        borderColor: errorMessage ? '#FF3B30' : theme.border,
                    },
                ]}
            >
                {leftIcon && leftIcon.type === 'font-awesome' && (
                    <FontAwesome
                        name={leftIcon.name as any}
                        size={20}
                        color={theme.secondaryText}
                        style={styles.icon}
                    />
                )}
                <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholderTextColor={theme.secondaryText}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    {...textInputProps}
                />
                {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
            </View>
            {errorMessage && (
                <Text style={[styles.errorText, { color: '#FF3B30' }]}>{errorMessage}</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        minHeight: 48,
    },
    icon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 12,
    },
    rightElement: {
        marginLeft: 8,
    },
    errorText: {
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
    },
});

