import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from '../theme';

type Theme = typeof lightTheme;

interface ThemeContextType {
    theme: Theme;
    isDark: boolean;
    toggleTheme: () => void;
    setTheme: (isDark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@plov_theme_preference';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemColorScheme = useColorScheme();
    const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
    const [isLoading, setIsLoading] = useState(true);

    // Load saved theme preference on mount
    useEffect(() => {
        const loadThemePreference = async () => {
            try {
                const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (savedTheme !== null) {
                    setIsDark(savedTheme === 'dark');
                } else {
                    // If no saved preference, use system preference
                    setIsDark(systemColorScheme === 'dark');
                }
            } catch (error) {
                console.error('Error loading theme preference:', error);
                // Fallback to system preference on error
                setIsDark(systemColorScheme === 'dark');
            } finally {
                setIsLoading(false);
            }
        };

        loadThemePreference();
    }, []);

    // Save theme preference whenever it changes
    useEffect(() => {
        if (!isLoading) {
            const saveThemePreference = async () => {
                try {
                    await AsyncStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
                } catch (error) {
                    console.error('Error saving theme preference:', error);
                }
            };

            saveThemePreference();
        }
    }, [isDark, isLoading]);

    const toggleTheme = () => {
        setIsDark(prev => !prev);
    };

    const setTheme = (dark: boolean) => {
        setIsDark(dark);
    };

    const theme = isDark ? darkTheme : lightTheme;

    return (
        <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

