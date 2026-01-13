import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextValue = { session: Session | null; loading: boolean };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                // If there's an error getting the session (e.g., invalid refresh token), clear it
                // This happens when the refresh token is missing or expired
                if (error.message?.includes('refresh') || error.message?.includes('token')) {
                    // Silently clear invalid session - user will need to sign in again
                    supabase.auth.signOut().catch(() => {
                        // Ignore sign out errors
                    });
                }
                setSession(null);
            } else {
                setSession(session);
            }
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            // Handle all auth state changes, including when refresh token fails
            if (event === 'SIGNED_OUT' || !session) {
                // Session is invalid or user signed out - clear session
                setSession(null);
            } else {
                // Valid session - update it
                setSession(session);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ session, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}