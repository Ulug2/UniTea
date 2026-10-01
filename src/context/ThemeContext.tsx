import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightTheme, darkTheme } from "../theme";

export type Theme = typeof lightTheme;

interface ThemeContextType {
  theme: Theme;
  /** True when the app is actually rendering in dark mode (manual or system). */
  isDark: boolean;
  /** True when the user has manually forced dark mode via the toggle. */
  isManualDark: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "@unitea_theme_preference";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Reactive: updates whenever the user changes the iPhone's appearance.
  const systemColorScheme = useColorScheme();

  // false = follow system (default). true = force dark mode.
  const [isManualDark, setIsManualDark] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load saved preference once on mount.
  useEffect(() => {
    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === "manual_dark") {
          setIsManualDark(true);
        }
        // null or anything else → follow system (isManualDark stays false)
      } catch (error) {
        console.error("Error loading theme preference:", error);
      } finally {
        setIsInitialized(true);
      }
    };
    load();
  }, []);

  // Persist whenever the preference changes (but never before the initial load).
  useEffect(() => {
    if (!isInitialized) return;
    const save = async () => {
      try {
        if (isManualDark) {
          await AsyncStorage.setItem(THEME_STORAGE_KEY, "manual_dark");
        } else {
          await AsyncStorage.removeItem(THEME_STORAGE_KEY);
        }
      } catch (error) {
        console.error("Error saving theme preference:", error);
      }
    };
    save();
  }, [isManualDark, isInitialized]);

  // When toggle is OFF, follow the iPhone appearance live. When ON, always dark.
  const isDark = isManualDark || systemColorScheme === "dark";

  const toggleTheme = () => {
    setIsManualDark((prev) => !prev);
  };

  const setTheme = (dark: boolean) => {
    setIsManualDark(dark);
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider
      value={{ theme, isDark, isManualDark, toggleTheme, setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

const noop = () => {};

/**
 * Provides a fixed theme to a subtree without reading or persisting the
 * user's saved preference (nesting a second ThemeProvider would rewrite
 * THEME_STORAGE_KEY on mount). Used by the post card preview, whose capture
 * card is always rendered in the light theme.
 */
export function StaticThemeProvider({
  isDark,
  children,
}: {
  isDark: boolean;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      isManualDark: false,
      toggleTheme: noop,
      setTheme: noop,
    }),
    [isDark],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
