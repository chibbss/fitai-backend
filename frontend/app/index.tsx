import { StatusBar, StyleSheet, View, Platform, Image } from 'react-native'
import React, { useEffect, useState } from 'react'
import { colors, spacingX } from '@/constants/theme'
import { useFonts } from 'expo-font';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';

import Animated, { FadeInDown } from 'react-native-reanimated'
import { useRootNavigationState, useRootNavigation, useRouter } from 'expo-router'
import { useAuth } from '@/context/AuthContext';
import { checkOnboardingStatus } from '@/utils/onboarding';
import { logger } from '@/utils/logger';

import logo from '@/assets/images/FitIcon.png';



const SplashScreen = () => {
    const [fontsLoaded, fontError] = useFonts({
        Pacifico: require('../assets/fonts/Pacifico-Regular.ttf'),
    });

    const router = useRouter();
    const rootNavigation = useRootNavigation();
    const rootState = useRootNavigationState();
    const [shouldNavigate, setShouldNavigate] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState(false);
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();

    // Wait for fonts to load before showing content
    useEffect(() => {
        if (fontError) {
            console.error('Font loading error:', fontError);
            setIsReady(true);
            setShouldNavigate(true);
            return;
        }
        if (fontsLoaded) {
            setIsReady(true);
            const timeout = setTimeout(() => {
                setShouldNavigate(true);
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [fontsLoaded, fontError]);



    // Check authentication and navigate based on session validity and onboarding status
    useEffect(() => {
        if (!shouldNavigate) return;
        if (!rootState?.key || !rootNavigation?.isReady()) return;

        // Timeout fallback - if auth loading takes too long, navigate to welcome
        const timeoutId = setTimeout(() => {
            if (authLoading) {
                logger.warn('[Splash] Auth check timeout, navigating to welcome');
                router.replace('/welcome');
            }
        }, 5000); // 5 second timeout

        // Wait for auth check to complete, but with timeout protection
        if (authLoading) {
            return () => clearTimeout(timeoutId);
        }

        const checkAuthAndOnboarding = async () => {
            try {
                if (!isAuthenticated || !user) {
                    logger.log('❌ User not authenticated, navigating to welcome');
                    router.replace('/welcome');
                    return;
                }

                // Check onboarding status
                try {
                    const { isComplete, userData } = await checkOnboardingStatus(user.id);
                    
                    logger.log('[Splash] Onboarding check result:', {
                        userId: user.id,
                        isComplete,
                        hasUserData: !!userData,
                    });
                    
                    if (isComplete) {
                        logger.log('✅ User authenticated and onboarding complete, navigating to chatscreen');
                        router.replace('/chatscreen');
                    } else {
                        logger.log('⚠️ User authenticated but onboarding incomplete, navigating to onboarding');
                        logger.log('[Splash] User data received:', {
                            hasGoals: !!userData?.goals,
                            hasProfile: !!userData?.profile,
                            primaryGoal: userData?.goals?.primary_goal,
                            experienceLevel: userData?.profile?.experience_level,
                            workoutPreference: userData?.profile?.workout_preference,
                        });
                        router.replace('/onboarding');
                    }
                } catch (error: any) {
                    logger.error('Error checking onboarding status:', error);
                    logger.error('Error details:', {
                        message: error?.message,
                        stack: error?.stack,
                        userId: user.id,
                    });
                    // On error, assume onboarding incomplete and redirect to onboarding
                    router.replace('/onboarding');
                }
            } catch (error: any) {
                logger.error('[Splash] Unexpected error in auth check:', error);
                // Fallback to welcome screen on any error
                router.replace('/welcome');
            } finally {
                clearTimeout(timeoutId);
            }
        };

        checkAuthAndOnboarding();

        return () => clearTimeout(timeoutId);
    }, [shouldNavigate, rootState, rootNavigation, isAuthenticated, authLoading, user, router]);

    return (
        <View style={styles.wrapper}>
            <StatusBar
                barStyle="light-content"
                backgroundColor={colors.deepCharcoal}
                translucent={Platform.OS === 'android'}
            />
            <SafeAreaView
                style={styles.container}
                edges={['top', 'bottom', 'left', 'right']}
            >
                {isReady && (
                    <Animated.Image
                        entering={FadeInDown.duration(700).springify().damping(20).stiffness(80)}
                        style={styles.logoImage}
                        source={logo}
                        resizeMode='contain'
                    />
                )}
            </SafeAreaView>
        </View>
    )
}

export default SplashScreen

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: colors.deepCharcoal,
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.deepCharcoal,
        width: '100%',
    },
    logoText: {
        fontFamily: 'Pacifico',
        color: colors.white,
        fontSize: 104,
        letterSpacing: 1.5,
        textAlign: 'center',
        textShadowColor: 'rgba(255, 255, 255, 0.25)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
        // Prevent overflow
        maxWidth: '90%',
        paddingHorizontal: spacingX._20,
    },
    logoImage: {
        width: 360,
        height: 360
    }
})