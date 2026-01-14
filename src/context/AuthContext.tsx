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
          console.error("[AuthContext] Session error:", sessionError);

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
        } else {
          setSession(initialSession);
          setError(null);
        }
      } catch (err) {
        console.error("[AuthContext] Fatal auth error:", err);
        setError(err as Error);
        setSession(null);
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

      console.log("[AuthContext] Auth event:", event);

      // Handle different auth events
      switch (event) {
        case "SIGNED_OUT":
          setSession(null);
          setError(null);
          break;

        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
          setSession(newSession);
          setError(null);
          break;

        case "USER_UPDATED":
          // Update session with new user data
          if (newSession) {
            setSession(newSession);
          }
          break;

        case "PASSWORD_RECOVERY":
          // Handle password reset flow
          console.log("[AuthContext] Password recovery initiated");
          break;

        default:
          // Handle any other session state
          setSession(newSession);
          if (newSession) {
            setError(null);
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
