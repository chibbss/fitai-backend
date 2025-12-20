import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform, Alert } from 'react-native';
import { supabase } from './supabase';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { API_URL } from './config';
import { alert } from './alert';
import { logger } from './logger';

// Complete the auth session properly
WebBrowser.maybeCompleteAuthSession();

const redirectTo = Linking.createURL('/callback');

/**
 * Sign in with Google OAuth
 */
export const signInWithGoogle = async () => {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        });

        if (error) throw error;

        // The OAuth flow will redirect to callback screen
        // which will handle the rest
        return { data, error: null };
    } catch (error: any) {
        logger.error('Google sign-in error:', error);
        alert.error(error.message || 'Failed to sign in with Google', 'Error');
        return { data: null, error };
    }
};

/**
 * Sign in with Apple OAuth (iOS only)
 */
export const signInWithApple = async () => {
    if (Platform.OS !== 'ios') {
        Alert.alert('Not Available', 'Apple Sign-In is only available on iOS devices.');
        return { data: null, error: new Error('Apple Sign-In only available on iOS') };
    }

    try {
        // Check if Apple Authentication is available
        const isAvailable = await AppleAuthentication.isAvailableAsync();
        if (!isAvailable) {
            Alert.alert('Not Available', 'Apple Sign-In is not available on this device.');
            return { data: null, error: new Error('Apple Sign-In not available') };
        }

        // Request Apple authentication
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
        });

        // Exchange Apple credential for Supabase session
        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken!,
            nonce: credential.nonce || undefined,
        });

        if (error) throw error;

        // Handle post-auth flow
        await handlePostOAuthFlow(data.user, data.session);

        return { data, error: null };
    } catch (error: any) {
        logger.error('Apple sign-in error:', error);
        
        // Handle user cancellation
        if (error.code === 'ERR_REQUEST_CANCELED') {
            return { data: null, error: null }; // User cancelled, don't show error
        }
        
        Alert.alert('Error', error.message || 'Failed to sign in with Apple');
        return { data: null, error };
    }
};

/**
 * Handle post-OAuth authentication flow
 * Determines if user should go to onboarding (new user) or chatscreen (existing user)
 */
export const handlePostOAuthFlow = async (user: any, session: any) => {
    if (!user || !session) {
        throw new Error('Missing user or session data');
    }

    const token = session.access_token;
    const apiUrl = API_URL;

    try {
        // Check if user exists in backend
        const userResponse = await fetch(`${apiUrl}/users/${user.id}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (userResponse.status === 404) {
            // New user - create profile and go to onboarding
            await fetch(`${apiUrl}/users/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: user.email,
                    name: user.user_metadata?.full_name || 
                          user.user_metadata?.name || 
                          user.email?.split('@')[0] || 
                          'User',
                    profile: {},
                    goals: {},
                    metadata: {
                        signup_source: 'oauth',
                        provider: user.app_metadata?.provider || 'unknown',
                    },
                }),
            });

            // G�� Pre-load FitAI context for faster chat responses
            fetch(`${apiUrl}/users/${user.id}/preload-context`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            })
            .then(() => {
                logger.log('Context pre-loaded for OAuth user');
            })
            .catch(err => {
                logger.warn('Context pre-load failed (non-critical):', err);
            });

            // Navigate to onboarding for new users
            router.replace('/onboarding');
        } else {
            // Existing user - pre-load context before going to chatscreen
            fetch(`${apiUrl}/users/${user.id}/preload-context`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            })
            .then(() => {
                logger.log('Context pre-loaded for existing user');
            })
            .catch(err => {
                logger.warn('Context pre-load failed (non-critical):', err);
            });

            // Existing user - go to chatscreen
            router.replace('/chatscreen');
        }
    } catch (apiError) {
        logger.error('Backend API error:', apiError);
        // If backend check fails, assume new user and go to onboarding
        router.replace('/onboarding');
    }
};
