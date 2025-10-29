import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Deep link redirect URL for email verification
// This matches the route: app/auth-callback.tsx
const redirectUrl = 'fitai://auth-callback';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Get the redirect URL for auth operations
export const getAuthRedirectUrl = () => {
  return redirectUrl;
};

// Setup deep link listener for auth callbacks
export const setupAuthListener = () => {
  // Handle URL when app is already open
  const urlSubscription = Linking.addEventListener('url', async ({ url }) => {
    console.log('Deep link received:', url);
    
    // Let Supabase handle the auth callback
    if (url?.includes('access_token') || url?.includes('type=')) {
      try {
        // The callback.tsx screen will handle this
        console.log('Auth callback detected in URL');
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    }
  });

  // Handle app state changes (when returning from email app)
  const appStateSubscription = AppState.addEventListener('change', async (state) => {
    if (state === 'active') {
      // Check for session when app becomes active
      const { data: { session } } = await supabase.auth.getSession();
      console.log('App became active, session:', session ? 'exists' : 'none');
    }
  });

  return () => {
    urlSubscription.remove();
    appStateSubscription.remove();
  };
};