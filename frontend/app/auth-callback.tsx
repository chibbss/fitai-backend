import { View, StyleSheet, Alert } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import ScreenWrapper from '@/components/ScreenWrapper';
import Loading from '@/components/Loading';
import Typo from '@/components/Typo';
import { colors, spacingY } from '@/constants/theme';
import { supabase } from '@/utils/supabase';
import * as Linking from 'expo-linking';
import * as Icons from 'phosphor-react-native';
import { verticalScale } from '@/utils/styling';

const AuthCallback = () => {
  const router = useRouter();
  const [status, setStatus] = useState('Verifying your email...');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const runCallback = async () => {
      await handleCallback();
    };
    runCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        router.replace('/(auth)/login');
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
        setIsError(true);
        setStatus(errorDescription || 'Verification failed. Please try again.');
        
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 3000);
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
          setIsError(true);
          setStatus('Failed to create session. Please try logging in.');
          
          setTimeout(() => {
            router.replace('/(auth)/login');
          }, 3000);
          return;
        }

        // Get user data
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error('User error:', userError);
          router.replace('/(auth)/login');
          return;
        }

        setStatus('Creating your profile...');

        // Create backend profile
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
        
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

        // Show success message
        setIsSuccess(true);
        setStatus('Email verified successfully! 🎉');

        // Delay before redirecting to show success message
        setTimeout(() => {
          // Navigate based on verification type
          if (type === 'signup' || type === 'email_verification') {
            router.replace('/(main)/onboarding');
          }  else {
            router.replace('/(main)/chatscreen');
          }
        }, 2000); // Show success for 2 seconds
      } else {
        console.log('No tokens found, redirecting to login');
        router.replace('/(auth)/login');
      }
      
    } catch (error) {
      console.error('Callback error:', error);
      setIsError(true);
      setStatus('Something went wrong. Please try again.');
      
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 3000);
    }
  };

  return (
    <ScreenWrapper showPattern={false}>
      <View style={styles.container}>
        {/* Success Icon */}
        {isSuccess && (
          <Icons.CheckCircle 
            size={verticalScale(80)} 
            color={colors.primary} 
            weight="fill"
          />
        )}
        
        {/* Error Icon */}
        {isError && (
          <Icons.XCircle 
            size={verticalScale(80)} 
            color="#ef4444" 
            weight="fill"
          />
        )}
        
        {/* Loading Spinner */}
        {!isSuccess && !isError && (
          <Loading size="large" color={colors.primary} />
        )}
        
        <Typo 
          size={isSuccess || isError ? 24 : 18}
          fontWeight={isSuccess || isError ? '600' : '400'}
          color={isError ? '#ef4444' : colors.white}
          style={{ 
            marginTop: spacingY._20, 
            textAlign: 'center',
            paddingHorizontal: 40,
          }}
        >
          {status}
        </Typo>
        
        {isSuccess && (
          <Typo 
            size={16}
            color={colors.neutral400}
            style={{ 
              marginTop: spacingY._10, 
              textAlign: 'center',
              paddingHorizontal: 40,
            }}
          >
            Taking you to onboarding...
          </Typo>
        )}
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