import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl || Constants.expoConfig?.extra?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.supabaseAnonKey || Constants.expoConfig?.extra?.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Auth calls will fail until these env vars are set.'
  );
}

/**
 * Deep-link redirect used when Supabase sends magic-link / verify emails.
 * This should match the value configured in your Supabase dashboard.
 */
const AUTH_CALLBACK_URL = Linking.createURL('/callback');

// Custom storage adapter that handles environment issues (like 'window is not defined' during builds)
const SafeStorage = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      // Return null if storage unavailable (e.g. during build)
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      // Ignore errors
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      // Ignore errors
    }
  },
};

// Provide dummy values if missing to prevent createClient from throwing on boot. 
// We also check if the URL is a valid format (starts with http) to avoid crashing on literal string names.
const isValidUrl = SUPABASE_URL && SUPABASE_URL.startsWith('http');
const finalUrl = isValidUrl ? SUPABASE_URL : 'https://placeholder.supabase.co';
const finalKey = SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    storage: SafeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

/**
 * Returns the redirect URL passed to Supabase for email confirmation flows.
 */
export const getAuthRedirectUrl = (): string => AUTH_CALLBACK_URL;

/**
 * Sets up global listeners so deep links delivered while the app is open are logged
 * (the actual session handling happens in your auth-callback screen) and ensures
 * we re-check the session whenever the app comes back to the foreground.
 */
export const setupAuthListener = () => {
  const handleDeepLink = ({ url }: { url: string }) => {
    if (!url) {
      return;
    }

    if (url.includes('access_token') || url.includes('type=')) {
      console.log('[supabase] Auth deep link received:', url);
    } else {
      console.log('[supabase] URL received:', url);
    }
  };

  const handleAppStateChange = async (state: AppStateStatus) => {
    if (state !== 'active') {
      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();

      // Handle invalid refresh token
      if (error && (error.message?.includes('Invalid Refresh Token') ||
        error.message?.includes('refresh_token_not_found'))) {
        console.log('[supabase] Invalid refresh token, clearing session');
        await supabase.auth.signOut().catch(() => {
          // Ignore signOut errors
        });
        return;
      }

      console.log(
        '[supabase] App foregrounded. Session',
        data.session ? 'present' : 'missing'
      );
    } catch (error) {
      console.warn('[supabase] Failed to refresh session after foreground.', error);
      // Clear session on error to prevent stuck state
      try {
        await supabase.auth.signOut().catch(() => {
          // Ignore signOut errors
        });
      } catch {
        // Ignore
      }
    }
  };

  const urlSubscription = Linking.addEventListener('url', handleDeepLink);
  const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    urlSubscription.remove();
    appStateSubscription.remove();
  };
};

/**
 * Convenience helper if you need to inspect the URL that launched the app.
 */
export const getInitialDeepLink = async (): Promise<string | null> => {
  try {
    const url = await Linking.getInitialURL();
    if (url) {
      return url;
    }

    if (typeof window !== 'undefined') {
      return window.location.href ?? null;
    }
  } catch (error) {
    console.warn('[supabase] Failed to read initial URL:', error);
  }

  return null;
};