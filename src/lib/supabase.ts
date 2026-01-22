import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'
import { Database } from "../types/database.types"

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Validate environment variables at startup
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web", // Enable only for web
        lock: processLock,
        // Add retry configuration for auth operations
        flowType: 'pkce', // More secure auth flow
    },
    global: {
        headers: {
            'x-client-info': `unitee-mobile/${Platform.OS}`,
        },
    },
    db: {
        schema: 'public',
    },
    realtime: {
        // Optimize real-time connection
        params: {
            eventsPerSecond: 10, // Prevent flooding from rapid updates
        },
        // Increase timeout for slower connections
        timeout: 20000, // 20 seconds (default is 10s)
    },
})

// Limit concurrent requests from client
const supabaseWithPooling = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
        schema: 'public',
    },
    global: {
        fetch: (url, options = {}) => {
            // Add request queue/throttling here if needed
            return fetch(url, options);
        },
    },
});

// Tells Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
if (Platform.OS !== "web") {
    AppState.addEventListener('change', (state) => {
        if (state === 'active') {
            supabase.auth.startAutoRefresh()
        } else {
            supabase.auth.stopAutoRefresh()
        }
    })
}