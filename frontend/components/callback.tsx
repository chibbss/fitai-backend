import { View, StyleSheet, Alert } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import ScreenWrapper from '@/components/ScreenWrapper';
import Loading from '@/components/Loading';
import Typo from '@/components/Typo';
import { colors, spacingY } from '@/constants/theme';
import { supabase } from '@/utils/supabase';
import * as Linking from 'expo-linking';
import { API_URL } from '@/utils/config';
import { alert } from '@/utils/alert';

const AuthCallback = () => {
  const router = useRouter();
  const [status, setStatus] = useState('Verifying your email...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      setStatus('Processing verification link...');

      // Get the URL that opened the app
      let url = await Linking.getInitialURL();
      
      // If running on web, use window location
      if (!url && typeof window !== 'undefined') {
        url = window.location.href;
      }

      console.log('Callback URL:', url);

      if (!url) {
        console.log('No URL found, redirecting to login');
        router.replace('/login');
        return;
      }

      // Parse the URL - handle both hash (#) and query (?) parameters
      const parsedUrl = Linking.parse(url);
      let params: Record<string, any> = {};

      // Check for hash parameters (Supabase uses # for tokens)
      if (url.includes('#')) {
        const hashPart = url.split('#')[1];
        const hashParams = new URLSearchParams(hashPart);
        hashParams.forEach((value, key) => {
          params[key] = value;
        });
      }

      // Also check query parameters
      if (parsedUrl.queryParams) {
        params = { ...params, ...parsedUrl.queryParams };
      }

      console.log('Parsed params:', params);

      const accessToken = params.access_token;
      const refreshToken = params.refresh_token;
      const type = params.type;
      const error = params.error;
      const errorDescription = params.error_description;

      // Handle errors from Supabase
      if (error) {
        console.error('Auth error:', error, errorDescription);
        alert.show({
          message: errorDescription || 'Failed to verify email. Please try again.',
          title: 'Verification Error',
          type: 'error',
          buttons: [{ text: 'OK', onPress: () => router.replace('/login') }]
        });
        return;
      }

      // Process tokens
      if (accessToken && refreshToken) {
        setStatus('Setting up your session...');

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error('Session error:', sessionError);
          alert.show({
            message: 'Failed to create session. Please try logging in.',
            title: 'Session Error',
            type: 'error',
            buttons: [{ text: 'OK', onPress: () => router.replace('/login') }]
          });
          return;
        }

        // Get user data
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error('User error:', userError);
          router.replace('/login');
          return;
        }

        setStatus('Creating your profile...');

        // Create backend profile
        const apiUrl = API_URL;
        
        try {
          const response = await fetch(`${apiUrl}/users/${user.id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: user.email,
              name: user.user_metadata?.name || user.email?.split('@')[0] || '',
              profile: {},
              goals: {},
              metadata: {
                verified_at: new Date().toISOString(),
                signup_type: type || 'email',
              },
            }),
          });

          if (!response.ok) {
            console.error('Backend API error:', await response.text());
          }
        } catch (apiError) {
          console.error('Backend API error:', apiError);
          // Don't block the user from continuing even if backend fails
        }

        setStatus('Success! Redirecting...');

        // Small delay to show success message
        setTimeout(() => {
          // Navigate based on verification type
          if (type === 'signup' || type === 'email_verification') {
            router.replace('/onboarding');
          } else if (type === 'recovery') {
            router.replace('/login');
          } else {
            router.replace('/chatscreen');
          }
        }, 500);
      } else {
        console.log('No tokens found, redirecting to login');
        router.replace('/login');
      }
      
    } catch (error) {
      console.error('Callback error:', error);
      alert.show({
        message: 'Something went wrong during verification. Please try again.',
        title: 'Error',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => router.replace('/login') }]
      });
    }
  };

  return (
    <ScreenWrapper showPattern={false}>
      <View style={styles.container}>
        <Loading size="large" color={colors.primary} />
        <Typo 
          size={18} 
          color={colors.white} 
          style={{ marginTop: spacingY._20, textAlign: 'center' }}
        >
          {status}
        </Typo>
      </View>
    </ScreenWrapper>
  );
};

export default AuthCallback;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
