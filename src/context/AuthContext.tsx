import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
  useRef,
} from "react";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";

const PROFILE_CACHE_KEY = "@unitee:profile_cache";

export type CachedProfile = {
  avatar_url: string | null;
  username: string | null;
};

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
  /** Profile data persisted across cold starts via AsyncStorage. */
  cachedProfile: CachedProfile | null;
  /** Call this after a profile fetch/update to keep AsyncStorage in sync. */
  persistProfile: (profile: CachedProfile) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cachedProfile, setCachedProfile] = useState<CachedProfile | null>(null);
  const isInitialized = useRef(false);

  const persistProfile = useCallback(async (profile: CachedProfile) => {
    setCachedProfile(profile);
    try {
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } catch (err) {
      logger.error("[AuthContext] Failed to persist profile", err as Error);
    }
  }, []);

  // Force-sign-out: clears local session state regardless of server response.
  // Without this, Supabase's SIGNED_OUT event may never fire when the server-side
  // session is already missing/expired, leaving AuthContext with a stale session
  // and causing the auth layout to bounce the user back to the protected screen.
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — we clear local state regardless
    }
    setSession(null);
    setError(null);
    setCachedProfile(null);
    logger.clearUser();
    try {
      await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Prevent race conditions by tracking initialization
    const initializeAuth = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;

      // Hydrate profile from AsyncStorage BEFORE the network session check so
      // ProfileHeader can render the avatar immediately on cold start.
      try {
        const stored = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
        if (stored && isMounted) {
          setCachedProfile(JSON.parse(stored) as CachedProfile);
        }
      } catch (err) {
        logger.error("[AuthContext] Failed to read cached profile", err as Error);
      }

      try {
        const {
          data: { session: initialSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
          logger.error("[AuthContext] Session error", sessionError as Error);

          const isTokenError =
            sessionError.message?.toLowerCase().includes("refresh") ||
            sessionError.message?.toLowerCase().includes("token") ||
            sessionError.message?.toLowerCase().includes("expired");

          if (isTokenError) {
            await supabase.auth.signOut().catch(() => {});
          }
          // Don't show alert on cold start (e.g. opening from deeplink); user just sees login
          setError(sessionError);
          setSession(null);
          logger.clearUser();
        } else {
          setSession(initialSession);
          setError(null);
          // Set user context in Sentry when session is available
          if (initialSession?.user) {
            logger.setUser(
              initialSession.user.id,
              initialSession.user.email,
              undefined,
            );
          }
        }
      } catch (err) {
        logger.error("[AuthContext] Fatal auth error", err as Error);
        setError(err as Error);
        setSession(null);
        logger.clearUser();
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      logger.breadcrumb(`Auth event: ${event}`, "auth", {
        event,
        hasSession: !!newSession,
      });

      // Handle different auth events
      switch (event) {
        case "SIGNED_OUT":
          setSession(null);
          setError(null);
          setCachedProfile(null);
          logger.clearUser();
          AsyncStorage.removeItem(PROFILE_CACHE_KEY).catch(() => {});
          break;

        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
          setSession(newSession);
          setError(null);
          // Set user context in Sentry
          if (newSession?.user) {
            logger.setUser(
              newSession.user.id,
              newSession.user.email,
              undefined,
            );
          }
          break;

        case "USER_UPDATED":
          // Update session with new user data
          if (newSession) {
            setSession(newSession);
            // Update Sentry user context
            logger.setUser(
              newSession.user.id,
              newSession.user.email,
              undefined,
            );
          }
          break;

        case "PASSWORD_RECOVERY":
          // Handle password reset flow
          logger.info("[AuthContext] Password recovery initiated");
          break;

        default:
          // Handle any other session state
          setSession(newSession);
          if (newSession) {
            setError(null);
            // Set user context if session exists
            logger.setUser(
              newSession.user.id,
              newSession.user.email,
              undefined,
            );
          }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, loading, error, signOut, cachedProfile, persistProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
