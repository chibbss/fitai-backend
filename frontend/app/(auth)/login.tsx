import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, Alert, Image } from 'react-native'
import React, { useRef, useState } from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { colors, radius, spacingX, spacingY } from '@/constants/theme'
import BackButton from '@/components/BackButton'
import Input from '@/components/Input'
import * as Icons from 'phosphor-react-native'
import { verticalScale } from '@/utils/styling'
import { useRouter } from 'expo-router'
import Button from '@/components/Button'
import Loading from '@/components/Loading'
import { supabase } from '@/utils/supabase'
import { alert } from '@/utils/alert';
import { API_URL, MOCK_MODE } from '@/utils/config';
import { LinearGradient } from 'expo-linear-gradient'
import MaskedView from '@react-native-masked-view/masked-view'
import { useTheme } from '@/context/ThemeContext'

import Animated, {
    SlideInDown,
    SlideInUp,
    SlideOutDown,
    useSharedValue,
    withTiming,
    useAnimatedStyle,
    runOnJS,
    FadeInDown
} from 'react-native-reanimated'
import { useFocusEffect } from '@react-navigation/native'
import PulseLogo from '@/components/PulseLogo'

const Login = () => {
    const emailRef = useRef('');
    const passwordRef = useRef('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const router = useRouter();
    const opacity = useSharedValue(1);
    const translateY = useSharedValue(0);
    const { mode, colors: themeColors, setPreference } = useTheme();


    useFocusEffect(
        React.useCallback(() => {
            opacity.value = 1;
            translateY.value = 0;
        }, [])
    );

    const navigateToRegister = () => {
        router.replace("/register");
    };

    const handleNavigateToRegister = () => {
        navigateToRegister();
    };

    const navigateToChatscreen = () => {
        router.replace("/chatscreen");
    };

    const handleNavigateToChatscreen = () => {
        opacity.value = withTiming(0, { duration: 250 }, (finished) => {
            if (finished) {
                runOnJS(navigateToChatscreen)();
            }
        });
    };

    // Animated style for slide and fade
    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [{ translateY: translateY.value }],
        };
    });

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleSubmit = async () => {
        if (!emailRef.current?.trim() || !passwordRef.current?.trim()) {
            alert.warning('Please fill all fields', 'Login');
            return
        }

        if (!validateEmail(emailRef.current)) {
            alert.warning('Please enter a valid email address.', 'Invalid email');
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Signing you in...');

        try {
            //sign in with supabase
            const { data, error } = await supabase.auth.signInWithPassword({
                email: emailRef.current.trim(),
                password: passwordRef.current,
            });

            if (error) {
                //handle specific errors
                if (error.message.includes('Invalid login credentials')) {
                    alert.error('Incorrect email or password. Please try again.', 'Login Failed');
                }

                else if (error.message.includes('Email not confirmed')) {
                    alert.warning('Please verify your email address before logging in. Check your inbox for the verification link.', 'Email Not Verified');
                }
                else {
                    alert.error(error.message, 'Login Error');
                }
                setIsLoading(false);
                return;
            }

            if (!data.user || !data.session) {
                alert.error('Failed to sign in. Please try again.', 'Login Error');
                setIsLoading(false);
                return;
            }

            // 🚨 MOCK MODE: Skip backend verification and allow navigation
            if (MOCK_MODE) {
                console.log('🤖 MOCK MODE: Skipping backend verification');
                setLoadingMessage('Mock mode: Backend offline');

                // Small delay for UX
                await new Promise(resolve => setTimeout(resolve, 500));

                setIsLoading(false);

                // Navigate directly to chatscreen without blocking
                handleNavigateToChatscreen();
                return;
            }

            setLoadingMessage('Setting up your profile...');

            // Helper function to fetch with timeout
            const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 5000): Promise<Response> => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                try {
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    return response;
                } catch (error: any) {
                    clearTimeout(timeoutId);
                    if (error.name === 'AbortError') {
                        throw new Error('Request timed out - backend may be offline');
                    }
                    throw error;
                }
            };

            // 2. Check if user exists in backend
            const token = data.session.access_token;
            const apiUrl = API_URL;
            try {
                // Check if user exists in backend with timeout
                const userResponse = await fetchWithTimeout(
                    `${apiUrl}/users/${data.user.id}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                    },
                    5000 // 5 second timeout
                );

                // If user doesn't exist in backend (404), redirect to sign up
                if (userResponse.status === 404) {
                    setIsLoading(false);
                    alert.warning('This account has not been set up yet. Please sign up first.', 'Account Not Found');
                    return;
                }

                // If user exists but there's an error (not 200/404), handle it
                if (!userResponse.ok) {
                    throw new Error(`Backend error: ${userResponse.status}`);
                }

                // User exists - continue with login
                // Pre-load FitAI context for faster chat responses (non-blocking)
                setLoadingMessage('Booting up FitAI...');
                fetchWithTimeout(
                    `${apiUrl}/users/${data.user.id}/preload-context`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                    },
                    3000 // 3 second timeout for preload (shorter since it's non-critical)
                )
                    .then(result => {
                        console.log('Context pre-loaded:', result);
                        // Don't wait for response - it runs in background
                    })
                    .catch(err => {
                        console.warn('Context pre-load failed (non-critical):', err);
                        // Non-critical - chat will still work, just slower
                    })

            } catch (apiError: any) {
                console.error('Backend API error:', apiError);

                // Check if it's a timeout or network error
                const isNetworkError = apiError.message?.includes('timeout') ||
                    apiError.message?.includes('fetch') ||
                    apiError.message?.includes('network') ||
                    apiError.message?.includes('Failed to fetch');

                if (isNetworkError) {
                    // Backend is likely offline
                    setIsLoading(false);
                    alert.error('Unable to connect to the server. Please check your internet connection and try again.', 'Connection Error');
                    return;
                } else {
                    // Other error - show message and stop login
                    setIsLoading(false);
                    alert.error('Unable to verify your account. Please try again later.', 'Login Error');
                    return;
                }
            }

            setLoadingMessage('Almost there...');

            // Small delay for better UX
            await new Promise(resolve => setTimeout(resolve, 500));

            setIsLoading(false);

            // 3. Navigate to main app (only if user exists in backend)
            handleNavigateToChatscreen();

        }

        catch (error: any) {
            setIsLoading(false);

            // Handle network errors
            if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('timeout')) {
                alert.error('Unable to connect. Please check your internet connection and try again.', 'Network Error');
            } else {
                alert.error(error.message || 'Something went wrong. Please try again.', 'Error');
            }
            console.error('Login error:', error);
        }
    };

    const handleResendVerification = async () => {
        if (!emailRef.current?.trim()) {
            alert.warning('Please enter your email address', 'Error');
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Sending verification email...');

        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: emailRef.current.trim(),
            });

            setIsLoading(false);

            if (error) {
                alert.error(error.message, 'Error');
            } else {
                alert.success('Verification email sent! Please check your inbox.', 'Success');
            }
        } catch (error: any) {
            setIsLoading(false);
            alert.error(error.message || 'Failed to send verification email', 'Error');
        }
    };

    const handleForgotPassword = async () => {
        if (!emailRef.current?.trim()) {
            alert.warning('Please enter your email address first', 'Reset Password');
            return;
        }

        if (!validateEmail(emailRef.current)) {
            alert.warning('Please enter a valid email address', 'Invalid Email');
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Sending password reset email...');

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(emailRef.current.trim());

            setIsLoading(false);

            if (error) {
                alert.error(error.message, 'Error');
            } else {
                alert.success('Password reset instructions have been sent to your email address.', 'Check Your Email');
            }
        } catch (error: any) {
            setIsLoading(false);
            alert.error(error.message || 'Failed to send reset email', 'Error');
        }
    };

    const handleGoogleSignIn = () => {
        alert.info('Google sign-in will be available in the next update!', 'Coming Soon');
    };

    const handleAppleSignIn = () => {
        alert.info('Apple sign-in will be available in the next update!', 'Coming Soon');
    };

    // Show full-screen loading while processing
    if (isLoading) {
        return (
            <ScreenWrapper showPattern={false}>
                

                <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
                    <Animated.View entering={FadeInDown.delay(150).springify()}>
                        <PulseLogo size={verticalScale(230)} />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(300).springify()}>
                        <Typo size={18} color={themeColors.textPrimary}
                            style={{ textAlign: 'center', marginTop: -25, marginLeft: 25 }}>
                            {loadingMessage}
                        </Typo>
                    </Animated.View>
                </View>
            </ScreenWrapper>
        );
    }

    const GradientText = ({ text }: { text: string }) => (
        <MaskedView
            style={{ marginBottom: 2 }}
            maskElement={
                <Typo fontWeight={'bold'} size={20}>{text}</Typo>
            }>
            <LinearGradient
                colors={themeColors.accentGradient}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
            >
                <Typo fontWeight={'bold'} size={20} style={{ opacity: 0 }}>
                    {text}
                </Typo>
            </LinearGradient>
        </MaskedView>
    );

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS == 'ios' ? 'padding' : 'height'}
        >
            <ScreenWrapper showPattern={false} bgOpacity={0.5} /*backgroundImage={require('@/assets/images/fitness-app-assets/welcome.png')}*/>
                <Animated.View
                    entering={SlideInDown.delay(300).springify()}
                    style={[{ flex: 1 }, animatedStyle]}
                >
                    <View style={styles.container}>
                        <View style={styles.header}>
                            <BackButton iconSize={38} />
                            <Pressable onPress={handleForgotPassword}>
                                <Typo size={17} color={colors.white}>Forgot your password?</Typo>
                            </Pressable>
                        </View>

                        <View style={styles.content}>
                            <ScrollView
                                contentContainerStyle={styles.form}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                <View style={{ gap: spacingY._10, marginBottom: spacingY._15 }}>
                                    <Typo size={28} fontWeight={'600'}>
                                        Welcome back
                                    </Typo>

                                    <Typo color={colors.neutral600}>
                                        Happy to see you
                                    </Typo>

                                    <Input
                                        placeholder='Enter your Email'
                                        onChangeText={(value: string) => emailRef.current = value}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        icon={
                                            <Icons.PasswordIcon size={verticalScale(26)}
                                                color={colors.neutral600}
                                            />
                                        }
                                    />

                                    <Input placeholder='Enter your Password'
                                        secureTextEntry
                                        onChangeText={(value: string) => passwordRef.current = value}
                                        icon={
                                            <Icons.LockIcon size={verticalScale(26)}
                                                color={colors.neutral600}
                                            />
                                        }
                                    />

                                    <View style={{ marginTop: spacingY._25, gap: spacingY._15 }}>
                                        <LinearGradient
                                            colors={themeColors.accentGradient}
                                            start={{ x: 0, y: 0.5 }}
                                            end={{ x: 1, y: 0.5 }}
                                            style={styles.buttonGradient}
                                        >
                                            <Button
                                                loading={isLoading}
                                                onPress={handleSubmit}
                                                style={{ backgroundColor: 'transparent' }}
                                            >
                                                <Typo fontWeight={'bold'} color={themeColors.background} size={20}>Login</Typo>
                                            </Button>
                                        </LinearGradient>

                                        <View style={styles.footer}>
                                            <Typo>Don't have an account?</Typo>
                                            <Pressable onPress={handleNavigateToRegister}>
                                                <Typo fontWeight={'bold'} color={colors.primaryDark}>
                                                    <GradientText text="Sign Up" />
                                                </Typo>
                                            </Pressable>
                                        </View>

                                    </View>
                                </View>

                                <View style={styles.dividerContainer}>
                                    <View style={styles.line} />
                                    <Typo color={colors.neutral500}>or</Typo>
                                    <View style={styles.line} />
                                </View>

                                <Button style={styles.googleButton} onPress={handleGoogleSignIn}>
                                    <Image
                                        source={require('../../assets/images/images/google.png')}
                                        style={styles.googleIcon}
                                    />
                                    <Typo fontWeight={'bold'} color={colors.black}>
                                        Continue with Google
                                    </Typo>
                                </Button>

                                <Button style={styles.googleButton} onPress={handleAppleSignIn}>
                                    <Image
                                        source={require('../../assets/images/images/apple.png')}
                                        style={styles.googleIcon}
                                    />
                                    <Typo fontWeight={'bold'} color={colors.black}>
                                        Continue with Apple
                                    </Typo>
                                </Button>
                            </ScrollView>
                        </View>
                    </View>

                </Animated.View>


            </ScreenWrapper>
        </KeyboardAvoidingView>

    )
}

export default Login

const styles = StyleSheet.create({
    container: {
        flex: 1,
        //gap: spacingY._30,
        // marginHorizontal: spacingX._20,
        justifyContent: 'space-between',
    },

    buttonGradient: {
        borderRadius: radius.full,
        overflow: 'hidden',
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacingY._60,
    },
    header: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._15,
        paddingBottom: spacingY._25,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },

    content: {
        flex: 1,
        backgroundColor: colors.white,
        borderTopLeftRadius: radius._50,
        borderTopRightRadius: radius._50,
        borderCurve: 'continuous',
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._20
    },

    form: {
        gap: spacingY._15,
        marginTop: spacingY._20
    },

    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: spacingY._15,
        gap: 10,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: colors.neutral300,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.neutral300,
        paddingVertical: spacingY._12,
        borderRadius: radius.full,
        borderCurve: 'continuous',
        height: verticalScale(56),
        gap: 10,
        backgroundColor: colors.white,

    },
    googleIcon: {
        width: 22,
        height: 22,
    },
});
