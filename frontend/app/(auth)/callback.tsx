import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Icons from 'phosphor-react-native';

import ScreenWrapper from '@/components/ScreenWrapper';
import Loading from '@/components/Loading';
import Typo from '@/components/Typo';
import { supabase } from '@/utils/supabase';
import { colors, spacingY } from '@/constants/theme';
import { verticalScale } from '@/utils/styling';
import Constants from 'expo-constants';
import { API_URL } from '@/utils/config';

const Callback = () => {
  const router = useRouter();
  const [status, setStatus] = useState('Verifying your email...');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setStatus('Processing verification link...');

        let url = await Linking.getInitialURL();
        if (!url && typeof window !== 'undefined') {
          url = window.location.href;
        }
        console.log('Auth callback URL:', url);

        if (!url) {
          router.replace('/login');
          return;
        }

        const parsed = Linking.parse(url);
        let params: Record<string, string> = {};

        if (url.includes('#')) {
          const hash = url.split('#')[1];
          const hashParams = new URLSearchParams(hash);
          hashParams.forEach((value, key) => {
            params[key] = value;
          });
        }

        if (parsed.queryParams) {
          Object.entries(parsed.queryParams).forEach(([key, value]) => {
            if (typeof value === 'string') {
              params[key] = value;
            } else if (Array.isArray(value) && value[0]) {
              params[key] = value[0];
            }
          });
        }

        console.log('Parsed params:', params);

        const { access_token, refresh_token, type, error, error_description } = params;

        if (error) {
          console.error('Supabase error:', error, error_description);
          setIsError(true);
          setStatus(error_description || 'Verification failed. Please try again.');
          setTimeout(() => router.replace('/login'), 3000);
          return;
        }

        if (!access_token || !refresh_token) {
          console.log('Missing tokens, sending to login');
          router.replace('/login');
          return;
        }

        setStatus('Setting up your session...');
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          console.error('Session error:', sessionError);
          setIsError(true);
          setStatus('Failed to create session. Please try again.');
          setTimeout(() => router.replace('/login'), 3000);
          return;
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          console.error('getUser error:', userError);
          router.replace('/login');
          return;
        }

        setStatus('Creating your profile...');
        const apiUrl = API_URL;
        console.log('  - API URL from Constants:', Constants.expoConfig?.extra?.apiUrl);
        console.log('  - Final API_URL being used:', apiUrl);

        try {
          const response = await fetch(`${apiUrl}/users/${user.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${access_token}`,
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
            console.error('Backend profile error:', await response.text());
          }
        } catch (apiError) {
          console.error('Backend profile exception:', apiError);
        }

        setIsSuccess(true);
        setStatus('Email verified successfully! 🎉');

        setTimeout(() => {
          if (type === 'signup' || type === 'email_verification') {
            router.replace('/onboarding');
          } else if (type === 'recovery') {
            router.replace('/login');
          } else {
            router.replace('/chatscreen');
          }
        }, 2000);
      } catch (e) {
        console.error('Callback failure:', e);
        setIsError(true);
        setStatus('Something went wrong. Please try again.');
        setTimeout(() => router.replace('/login'), 3000);
      }
    };

    run();
  }, [router]);

  return (
    <ScreenWrapper showPattern={false}>
      <View style={styles.container}>
        {isSuccess && (
          <Icons.CheckCircle
            size={verticalScale(80)}
            color={colors.primary}
            weight="fill"
          />
        )}

        {isError && (
          <Icons.XCircle
            size={verticalScale(80)}
            color="#ef4444"
            weight="fill"
          />
        )}

        {!isSuccess && !isError && (
          <Loading size="large" color={colors.primary} />
        )}

        <Typo
          size={isSuccess || isError ? 24 : 18}
          fontWeight={isSuccess || isError ? '600' : '400'}
          color={isError ? '#ef4444' : colors.white}
          style={styles.status}
        >
          {status}
        </Typo>

        {isSuccess && (
          <Typo
            size={16}
            color={colors.neutral400}
            style={styles.subStatus}
          >
            Taking you to onboarding...
          </Typo>
        )}
      </View>
    </ScreenWrapper>
  );
};

export default Callback;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  status: {
    marginTop: spacingY._20,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  subStatus: {
    marginTop: spacingY._10,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});