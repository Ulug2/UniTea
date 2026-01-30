import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
} from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Alert } from "react-native";
import { logger } from "../utils/logger";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: Error | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // Prevent race conditions by tracking initialization
    const initializeAuth = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;

      try {
        const {
          data: { session: initialSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
          logger.error("[AuthContext] Session error", sessionError as Error);

          // Check if it's a refresh token issue
          const isTokenError =
            sessionError.message?.toLowerCase().includes("refresh") ||
            sessionError.message?.toLowerCase().includes("token") ||
            sessionError.message?.toLowerCase().includes("expired");

          if (isTokenError) {
            // Show user they need to sign in again
            Alert.alert(
              "Session Expired",
              "Your session has expired. Please sign in again.",
              [{ text: "OK" }]
            );

            // Clear invalid session
            await supabase.auth.signOut().catch(() => {
              // Ignore sign out errors
            });
          }

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
              undefined
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
          logger.clearUser();
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
              undefined
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
              undefined
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
              undefined
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
    <AuthContext.Provider value={{ session, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
