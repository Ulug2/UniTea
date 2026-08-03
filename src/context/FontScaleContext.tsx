import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type FontScalePreference = "automatic" | "small" | "default" | "large";

const FONT_SCALE_STORAGE_KEY = "@unitea_font_scale_preference";

// Applied on top of moderateScale()'s output (see src/utils/textScaling.tsx),
// before the OS's own accessibility scaling (bounded, applied natively).
// "automatic"/"default" both leave moderateScale's values untouched — under
// "automatic" the user gets only the (now-capped) system scaling; "default"
// is an explicit user choice that happens to match automatic's multiplier
// but is persisted (so it stays selected even if the user's system font
// scale later changes), matching Dark Mode's manual-vs-follow-system split.
export const FONT_SCALE_MULTIPLIERS: Record<FontScalePreference, number> = {
  automatic: 1,
  small: 0.9,
  default: 1,
  large: 1.15,
};

interface FontScaleContextType {
  preference: FontScalePreference;
  multiplier: number;
  setPreference: (preference: FontScalePreference) => void;
  resetToAutomatic: () => void;
}

export const FontScaleContext = createContext<FontScaleContextType | undefined>(
  undefined,
);

function isStoredFontScalePreference(
  value: string | null,
): value is "small" | "default" | "large" {
  return value === "small" || value === "default" || value === "large";
}

export function FontScaleProvider({ children }: { children: ReactNode }) {
  // "automatic" (nothing saved) is the default — mirrors ThemeContext's
  // "no saved key = follow system" pattern.
  const [preference, setPreferenceState] = useState<FontScalePreference>(
    "automatic",
  );
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY);
        if (isStoredFontScalePreference(saved)) {
          setPreferenceState(saved);
        }
      } catch (error) {
        console.error("Error loading font scale preference:", error);
      } finally {
        setIsInitialized(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const save = async () => {
      try {
        if (preference === "automatic") {
          await AsyncStorage.removeItem(FONT_SCALE_STORAGE_KEY);
        } else {
          await AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, preference);
        }
      } catch (error) {
        console.error("Error saving font scale preference:", error);
      }
    };
    save();
  }, [preference, isInitialized]);

  const setPreference = (next: FontScalePreference) => {
    setPreferenceState(next);
  };

  const resetToAutomatic = () => {
    setPreferenceState("automatic");
  };

  const multiplier = FONT_SCALE_MULTIPLIERS[preference];

  return (
    <FontScaleContext.Provider
      value={{ preference, multiplier, setPreference, resetToAutomatic }}
    >
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScale() {
  const context = useContext(FontScaleContext);
  if (context === undefined) {
    throw new Error("useFontScale must be used within a FontScaleProvider");
  }
  return context;
}
