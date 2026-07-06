import Input from '@/components/Input'
import Typo from '@/components/Typo'
import { Card, GradientButton } from '@/components/ui'
import { radius, spacingX, spacingY } from '@/constants/theme'
import { useTheme } from '@/context/ThemeContext'
import { alert } from '@/utils/alert'
import { API_URL, MOCK_MODE } from '@/utils/config'
import { verticalScale } from '@/utils/styling'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'expo-router'
import { CaretLeft, Envelope, Lock } from 'phosphor-react-native'
import React, { useRef, useState } from 'react'
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView, Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    View
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

const Login = () => {
    const emailRef = useRef('');
    const passwordRef = useRef('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [hasError, setHasError] = useState(false);
    const router = useRouter();
    const { mode, colors: themeColors, setPreference } = useTheme();
    const { colors } = useTheme()



    const navigateToRegister = () => {
        try {
            router.replace("/register");
        } catch (error) {
            console.error('Navigation error:', error);
            // Fallback to push if replace fails
            router.push("/register");
        }
    };

    const handleNavigateToRegister = () => {
        navigateToRegister();
    };

    const navigateToChatscreen = () => {
        router.replace("/chatscreen");
    };

    const handleNavigateToChatscreen = () => {
        navigateToChatscreen();
    };


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

            //  REMOVED: setIsLoading(false) 

            // 3. Navigate to main app immediately
            navigateToChatscreen();

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
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color={colors.accent} />
                {!!loadingMessage && (
                    <Typo size={14} color={colors.textSecondary} style={{ marginTop: 16, textAlign: 'center' }}>
                        {loadingMessage}
                    </Typo>
                )}
            </View>
        )
    }





    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
                <StatusBar barStyle="light-content" backgroundColor={colors.background} />

                {/* Back */}
                <Pressable onPress={() => router.back()} style={styles.backRow}>
                    <CaretLeft size={18} color={colors.textPrimary} weight="bold" />
                    <Typo size={15} color={colors.textPrimary}>Back</Typo>
                </Pressable>

                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"

                >
                    {/* Header */}
                    <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.header}>
                        <Typo size={32} fontWeight="800" color={colors.textPrimary}>Welcome Back</Typo>
                        <Typo size={15} color={colors.accent} style={{ marginTop: 6, textAlign: 'center' }}>
                            Continue your progress
                        </Typo>
                    </Animated.View>

                    {/* Form */}
                    <Animated.View entering={FadeInDown.delay(160).springify()}>
                        <Card style={styles.formCard}>
                            {/* Email */}
                            <View style={styles.field}>
                                <Typo size={13} fontWeight="600" color={colors.textSecondary}>Email</Typo>
                                <Input
                                    placeholder="your@email.com"
                                    onChangeText={(v: string) => emailRef.current = v}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    icon={<Envelope size={20} color={colors.textMuted} />}
                                />
                            </View>

                            {/* Password */}
                            <View style={styles.field}>
                                <Typo size={13} fontWeight="600" color={colors.textSecondary}>Password</Typo>
                                <Input
                                    placeholder="••••••••"
                                    secureTextEntry
                                    onChangeText={(v: string) => passwordRef.current = v}
                                    icon={<Lock size={20} color={colors.textMuted} />}
                                />
                            </View>

                            {/* Sign In button — inside the card */}
                            <GradientButton
                                title="Sign In"
                                onPress={handleSubmit}
                                loading={isLoading}
                                style={{ marginTop: spacingY._10 }}
                            />


                            {/* Divider */}
                            <View style={styles.divider}>
                                <View style={[styles.line, { backgroundColor: colors.border }]} />
                                <Typo size={12} color={colors.textMuted}>or continue with</Typo>
                                <View style={[styles.line, { backgroundColor: colors.border }]} />
                            </View>

                            {/* Social */}
                            <View style={styles.social}>
                                <Pressable
                                    style={[styles.socialBtn, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
                                    onPress={handleGoogleSignIn}
                                >
                                    <Image
                                        source={require('../../assets/images/images/google.png')}
                                        style={styles.socialIcon}
                                        resizeMode="contain"
                                    />
                                    <Typo size={15} fontWeight="800" color={colors.textPrimary}>Google</Typo>
                                </Pressable>

                                <Pressable
                                    style={[styles.socialBtn, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
                                    onPress={handleAppleSignIn}
                                >
                                    <Image
                                        source={require('../../assets/images/images/apple.png')}
                                        style={styles.socialIcon}
                                        resizeMode="contain"
                                    />
                                    <Typo size={15} fontWeight="800" color={colors.textPrimary}>Apple</Typo>
                                </Pressable>
                            </View>
                        </Card>
                    </Animated.View>





                    {/* Footer */}
                    <View style={styles.footer}>
                        <Typo size={14} color={colors.textSecondary}>Don't have an account?</Typo>
                        <Pressable onPress={handleNavigateToRegister}>
                            <Typo size={14} fontWeight="700" color={colors.accent}> Sign Up</Typo>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    )
}

export default Login

const styles = StyleSheet.create({
    safe: {
        flex: 1,
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._10,
        paddingBottom: 4,
    },
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: spacingX._20,
        paddingBottom: spacingY._30,
    },

    header: {
        marginTop: spacingY._25,
        marginBottom: spacingY._25,
        alignItems: 'center'
    },
    form: {
        gap: spacingY._15,
    },
    field: {
        gap: 6,
    },
    forgot: {
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
        marginVertical: spacingY._20,
    },
    line: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
    social: {
        flexDirection: 'row',
        gap: spacingX._12,
    },
    socialBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: verticalScale(52),
        borderRadius: radius._20,
        borderWidth: 1,
        gap: spacingX._10,
    },
    socialIcon: {
        width: 20,
        height: 20,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: spacingY._25,
    },
    formCard: {
        gap: spacingY._25,
        paddingVertical: spacingY._20,
    },
})
