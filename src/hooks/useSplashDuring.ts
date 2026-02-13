import * as SplashScreen from "expo-splash-screen";
import { useCallback } from "react";
import { hideSplashSafe } from "../utils/splash";
import { logger } from "../utils/logger";

export function useSplashDuring() {
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      await SplashScreen.preventAutoHideAsync();
    } catch (err) {
      logger.warn("[useSplashDuring] Could not prevent auto-hide splash", err as Error);
    }

    try {
      return await action();
    } catch (err) {
      await hideSplashSafe();
      throw err;
    }
  }, []);

  return { run };
}

