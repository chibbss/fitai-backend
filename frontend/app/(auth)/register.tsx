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
import { supabase, getAuthRedirectUrl } from '@/utils/supabase'
import { alert } from '@/utils/alert'
import Constants from 'expo-constants';
import { API_URL, MOCK_MODE } from '@/utils/config';
import Animated, {
    SlideInDown,
    SlideInUp,
    SlideOutDown,
    useSharedValue,
    withTiming,
    useAnimatedStyle,
    runOnJS
} from 'react-native-reanimated'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@/context/ThemeContext'

import { LinearGradient } from 'expo-linear-gradient'
import MaskedView from '@react-native-masked-view/masked-view'



const Register = () => {

    const nameRef = useRef('');
    const emailRef = useRef('');
    const passwordRef = useRef('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const router = useRouter();
    const { mode, colors: themeColors, setPreference } = useTheme();
    const opacity = useSharedValue(1);
    const translateY = useSharedValue(0);

    const [isNavigating, setIsNavigating] = useState(false);

    useFocusEffect(
        React.useCallback(() => {
            opacity.value = 1;
            translateY.value = 0;
        }, [])
    );

    const navigateToLogin = () => {
        router.push("/login");
    };

    const handleNavigateToLogin = () => {
        setIsNavigating(true);
        opacity.value = withTiming(0, { duration: 300 });

        setTimeout(() => {
            navigateToLogin();
        }, 150)
    };

    const navigateToOnboarding = () => {
        router.replace('/onboarding');
    };

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleNavigateToOnboarding = () => {
        opacity.value = withTiming(0, { duration: 250 }, (finished) => {
            if (finished) {
                runOnJS(navigateToOnboarding)();
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

    const handleSubmit = async () => {
        //Validation
        if (!nameRef.current?.trim() || !emailRef.current?.trim() || !passwordRef.current) {
            Alert.alert('Sign Up', 'Please fill in all fields');
            return;
        }

        if (!validateEmail(emailRef.current)) {
            Alert.alert('Invalid Email', 'Please enter a valid email address');
            return;
        }

        if (passwordRef.current.length < 6) {
            Alert.alert('Weak Password', 'Password must be at least 6 characters long');
            return;
        }
        setIsLoading(true);
        setLoadingMessage('Creating your account...');

        try {
            // 1. Sign up with Supabase (with email confirmation)
            const { data, error } = await supabase.auth.signUp({
                email: emailRef.current.trim(),
                password: passwordRef.current,
                options: {
                    data: {
                        name: nameRef.current
                    },
                    // COMMENTED OUT FOR TESTING - Disable deep linking
                    // emailRedirectTo: getAuthRedirectUrl()
                }
            });

            if (error) {
                // Handle specific Supabase errors
                if (error.message.includes('already registered')) {
                    Alert.alert('Sign Up Error', 'This email is already registered. Please log in instead.');
                }
                else {
                    Alert.alert('Sign Up Error', error.message);
                }
                setIsLoading(false);
                return;
            }

            if (!data.user) {
                Alert.alert('Sign Up Error', 'Account creation failed. Please try again.');
                setIsLoading(false);
                return;
            }

            // 🚨 MOCK MODE: Skip backend verification and allow navigation
            if (MOCK_MODE) {
                console.log('🤖 MOCK MODE: Skipping backend verification for sign up');
                setLoadingMessage('Mock mode: Backend offline');

                // Small delay for UX
                await new Promise(resolve => setTimeout(resolve, 500));

                setIsLoading(false);

                // Navigate directly to onboarding without blocking
                handleNavigateToOnboarding();
                return;
            }

            setLoadingMessage('Sending verification email...');

            // 2. Create backend profile immediately (for testing without email verification)
            const token = data.session?.access_token;

            // DEBUG: Log all relevant info
            console.log('🔍 REGISTRATION DEBUG:');
            console.log('  - User ID:', data.user?.id);
            console.log('  - Session exists:', !!data.session);
            console.log('  - Token exists:', !!token);
            console.log('  - EXPO_PUBLIC_API_URL from env:', process.env.EXPO_PUBLIC_API_URL);

            const apiUrl = API_URL.replace(/\/+$/, '');
            console.log('🔍 CONFIG DEBUG:');
            console.log('  - Constants.expoConfig exists:', !!Constants.expoConfig);
            console.log('  - Constants.expoConfig?.extra exists:', !!Constants.expoConfig?.extra);
            console.log('  - Constants.expoConfig?.extra?.apiUrl:', Constants.expoConfig?.extra?.apiUrl);
            console.log('  - process.env.EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);
            console.log('  - API_URL from config.ts:', API_URL);
            console.log('  - Final apiUrl being used:', apiUrl);

            console.log('  - Final apiUrl being used (normalized):', apiUrl);

            if (!token) {
                console.error('❌ No token available - session is null');
                Alert.alert(
                    'Session Error',
                    'No session available. Please check:\n\n1. Email confirmation is disabled in Supabase\n2. You can log in to get a session',
                    [{ text: 'OK' }]
                );
                setIsLoading(false);
                return;
            }

            try {
                setLoadingMessage('Connecting to backend...');

                // First, test the backend connection with a simple health check
                console.log('🔍 Testing backend connection...');
                const healthUrl = `${apiUrl}/health`;
                console.log('  - Health check URL:', healthUrl);

                // Add timeout to health check
                const healthController = new AbortController();
                const healthTimeout = setTimeout(() => healthController.abort(), 5000); // 5 second timeout

                let healthCheck;
                try {
                    healthCheck = await fetch(healthUrl, {
                        method: 'GET',
                        signal: healthController.signal,
                    });
                    clearTimeout(healthTimeout);
                } catch (fetchError: any) {
                    clearTimeout(healthTimeout);
                    if (fetchError.name === 'AbortError') {
                        throw new Error('Backend health check timed out after 5 seconds');
                    }
                    throw fetchError;
                }

                console.log('  - Health check status:', healthCheck.status);

                if (!healthCheck.ok) {
                    const healthText = await healthCheck.text();
                    console.error('❌ Health check failed:', healthText);
                    throw new Error(`Backend health check failed: ${healthCheck.status} - ${healthText}`);
                }

                const healthData = await healthCheck.json();
                console.log('✅ Backend is reachable:', healthData);

                // Now create the user profile
                setLoadingMessage('Creating your profile...');
                const createUserUrl = `${apiUrl}/users/${data.user.id}`;
                console.log('🔍 Creating user profile...');
                console.log('  - URL:', createUserUrl);
                console.log('  - User ID:', data.user.id);

                const createResponse = await fetch(createUserUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: data.user.email,
                        name: nameRef.current,
                        profile: {},
                        goals: {},
                        metadata: {
                            signup_source: 'mobile',
                        },
                    }),
                });

                console.log('  - Create user status:', createResponse.status);
                console.log('  - Create user ok:', createResponse.ok);

                if (!createResponse.ok) {
                    const errorText = await createResponse.text();
                    console.error('❌ Failed to create user profile:', errorText);
                    throw new Error(`Failed to create profile: ${createResponse.status} - ${errorText}`);
                }

                const userData = await createResponse.json();
                console.log('✅ User profile created:', userData);

                // ⚡ Pre-load FitAI context (non-blocking)
                setLoadingMessage('Loading FitAI...');
                fetch(`${apiUrl}/users/${data.user.id}/preload-context`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                })
                    .then(() => {
                        console.log('✅ Context pre-loaded for new user');
                    })
                    .catch(err => {
                        console.warn('⚠️ Context pre-load failed (non-critical):', err);
                    });

            } catch (apiError: any) {
                console.error('❌ Backend API error details:');
                console.error('  - Error name:', apiError?.name);
                console.error('  - Error message:', apiError?.message);
                console.error('  - Error stack:', apiError?.stack);
                console.error('  - API URL attempted:', apiUrl);

                let errorMessage = 'Failed to connect to backend. ';

                if (apiError?.message?.includes('network request failed') ||
                    apiError?.message?.includes('Failed to fetch') ||
                    apiError?.message?.includes('NetworkError')) {
                    errorMessage += `\n\nCannot reach: ${apiUrl}\n\nPlease check:\n`;
                    errorMessage += `1. Backend is running on ${apiUrl}\n`;
                    errorMessage += `2. Backend is accessible from your phone\n`;
                    errorMessage += `3. Both devices are on the same Wi-Fi\n`;
                    errorMessage += `4. Firewall allows port 8000\n`;
                    errorMessage += `5. Test in phone browser: ${apiUrl}/health`;
                } else {
                    errorMessage += apiError?.message || 'Unknown error';
                }

                Alert.alert('Backend Connection Error', errorMessage, [
                    {
                        text: 'Continue Anyway', onPress: () => {
                            setIsLoading(false);
                            router.replace('/onboarding');
                        }
                    },
                    { text: 'Retry', style: 'cancel' }
                ]);
                return;
            }

            // Small delay for UX
            await new Promise(resolve => setTimeout(resolve, 800));
            setIsLoading(false);

            // Navigate to Verify Email screen
            /*router.push({
                pathname: '/verify-email',
                params: { email: emailRef.current.trim() }
            })*/

            // Navigate directly to onboarding (FOR TESTING - bypasses email verification)
            handleNavigateToOnboarding();
        }

        catch (error: any) {
            setIsLoading(false)
            //network errors
            if (error.message?.includes('fetch')) {
                Alert.alert(
                    'Network Error',
                    'Unable to connect to the server. Please check your internet connection and try again.'
                );
            }

            else {
                Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
            }

            console.error('Registration Error:', error);
        }
    };

    const handleGoogleSignIn = () => {
        alert.success('Google Sign-In will be available in future updates!', 'Coming Soon');
    };

    const handleAppleSignIn = () => {
        alert.warning('Coming Soon', 'Apple Sign-In will be available in future updates!');
    };

    //Show full screen loading while processing
    if (isLoading) {
        return (
            <ScreenWrapper showPattern={false} >
                <View style={styles.loadingContainer}>
                    <Typo size={18} color={colors.white}
                        style={{ marginTop: spacingY._20, textAlign: 'center' }}>
                        {loadingMessage}
                    </Typo>
                </View>
            </ScreenWrapper>
        )
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
                            <Typo size={17} color={colors.white}>Need Help ?</Typo>
                        </View>

                        <View style={styles.content}>
                            <ScrollView
                                contentContainerStyle={styles.form}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                <View style={{ gap: spacingY._10, marginBottom: spacingY._15 }}>
                                    <Typo size={28} fontWeight={'600'}>
                                        Getting Started
                                    </Typo>

                                    <Typo color={colors.neutral600}>
                                        Create an Account
                                    </Typo>

                                    <Input placeholder='Enter your Name'
                                        onChangeText={(value: string) => nameRef.current = value}
                                        icon={
                                            <Icons.UserCircleIcon size={verticalScale(26)}
                                                color={colors.neutral600}
                                            />
                                        }
                                    />

                                    <Input placeholder='Enter your Email'
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
                                                <Typo fontWeight={'bold'} color={themeColors.background} size={20}>Sign Up</Typo>
                                            </Button>
                                        </LinearGradient>


                                        <View style={styles.footer}>
                                            <Typo>Already have an account?</Typo>
                                            <Pressable onPress={handleNavigateToLogin}>
                                                <GradientText text="Login" />
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

export default Register

const styles = StyleSheet.create({
    container: {
        flex: 1,
        //gap: spacingY._30,
        // marginHorizontal: spacingX._20,
        justifyContent: 'space-between',
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
        borderWidth: 1.1,
        borderColor: colors.neutral300,
        paddingVertical: spacingY._12,
        borderRadius: radius.full,
        borderCurve: 'continuous',
        height: verticalScale(56),
        gap: 10,
        backgroundColor: colors.white,
        elevation: 0,
    },
    googleIcon: {
        width: 22,
        height: 22,
    },
    buttonGradient: {
        borderRadius: radius.full,
        overflow: 'hidden',
    },

    signUpButton: {
        width: '100%',
        paddingVertical: spacingY._12,
        borderRadius: radius.full,
    },
});
