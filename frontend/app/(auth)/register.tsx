import Input from '@/components/Input'
import Typo from '@/components/Typo'
import { Card, GradientButton } from '@/components/ui'
import { radius, spacingX, spacingY } from '@/constants/theme'
import { useTheme } from '@/context/ThemeContext'
import { alert } from '@/utils/alert'
import { MOCK_MODE } from '@/utils/config'
import { verticalScale } from '@/utils/styling'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'expo-router'
import { CaretLeft, Envelope, Lock, User } from 'phosphor-react-native'
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



const Register = () => {

    const nameRef = useRef('');
    const emailRef = useRef('');
    const passwordRef = useRef('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const router = useRouter();
    const { mode, colors: themeColors, setPreference } = useTheme();
    const { colors } = useTheme()



    const [isNavigating, setIsNavigating] = useState(false);


    const navigateToLogin = () => {
        router.replace("/login");
    };

    const handleNavigateToLogin = () => {
        navigateToLogin();
    };

    const navigateToOnboarding = () => {
        router.replace('/onboarding');
    };

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleNavigateToOnboarding = () => {
        const handleNavigateToOnboarding = () => {
            navigateToOnboarding();
        };
    };


    const handleSubmit = async () => {
        //Validation
        if (!nameRef.current?.trim() || !emailRef.current?.trim() || !passwordRef.current) {
            alert.warning('Please fill in all fields', 'Sign Up');
            return;
        }

        if (!validateEmail(emailRef.current)) {
            alert.warning('Please enter a valid email address', 'Invalid Email');
            return;
        }

        if (passwordRef.current.length < 6) {
            alert.warning('Password must be at least 6 characters long', 'Weak Password');
            return;
        }
        setIsLoading(true);
        setLoadingMessage('Creating your account...');

        // 🚨 MOCK MODE: Bypass Supabase and go straight to Onboarding
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Skipping Supabase Sign Up');
            setLoadingMessage('Mock mode: Creating dummy account...');

            // Artificial delay for UX
            setTimeout(() => {
                setIsLoading(false);
                router.replace('/onboarding');
            }, 1000);
            return;
        }

        try {
            // 1. Sign up with Supabase using OTP (no password needed for OTP flow)
            const { data, error } = await supabase.auth.signInWithOtp({
                email: emailRef.current.trim(),
                options: {
                    data: {
                        name: nameRef.current
                    },
                    // Use OTP instead of email link
                    shouldCreateUser: true,
                }
            });

            if (error) {
                // Handle specific Supabase errors
                if (error.message.includes('already registered') || error.message.includes('already exists')) {
                    alert.error('This email is already registered. Please log in instead.', 'Sign Up Error');
                }
                else {
                    alert.error(error.message, 'Sign Up Error');
                }
                setIsLoading(false);
                return;
            }

            // With OTP flow, there's no session until OTP is verified
            // So we always navigate to OTP verification screen
            console.log('📧 OTP sent - navigating to OTP verification screen');
            setIsLoading(false);

            // Navigate to verify-email-otp screen with the user's email
            router.push({
                pathname: '/verify-email-otp' as any,
                params: { email: emailRef.current.trim() }
            });
            return;

        }

        catch (error: any) {
            setIsLoading(false)
            //network errors
            if (error.message?.includes('fetch')) {
                alert.error(
                    'Unable to connect to the server. Please check your internet connection and try again.',
                    'Network Error'
                );
            }

            else {
                alert.error(error.message || 'Something went wrong. Please try again.', 'Error');
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
                        <Typo size={32} fontWeight="800" color={colors.textPrimary}>Create Account</Typo>
                        <Typo size={15} color={colors.accent} style={{ marginTop: 6, textAlign: 'center' }}>
                            Start your fitness journey
                        </Typo>
                    </Animated.View>

                    {/* Form card */}
                    <Animated.View entering={FadeInDown.delay(160).springify()}>
                        <Card style={styles.formCard}>
                            <View style={styles.field}>
                                <Typo size={13} fontWeight="600" color={colors.textSecondary}>Name</Typo>
                                <Input
                                    placeholder="Your name"
                                    onChangeText={(v: string) => nameRef.current = v}
                                    icon={<User size={20} color={colors.textMuted} />}
                                />
                            </View>

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

                            <View style={styles.field}>
                                <Typo size={13} fontWeight="600" color={colors.textSecondary}>Password</Typo>
                                <Input
                                    placeholder="••••••••"
                                    secureTextEntry
                                    onChangeText={(v: string) => passwordRef.current = v}
                                    icon={<Lock size={20} color={colors.textMuted} />}
                                />
                            </View>

                            <GradientButton
                                title="Sign Up"
                                onPress={handleSubmit}
                                loading={isLoading}
                                style={{ marginTop: spacingY._10 }}
                            />
                        </Card>
                    </Animated.View>

                    {/* Divider */}
                    <View style={styles.divider}>
                        <View style={[styles.line, { backgroundColor: colors.border }]} />
                        <Typo size={12} color={colors.textMuted}>or continue with</Typo>
                        <View style={[styles.line, { backgroundColor: colors.border }]} />
                    </View>

                    {/* Social */}
                    <Animated.View entering={FadeInDown.delay(280).springify()} style={styles.social}>
                        <Pressable
                            style={[styles.socialBtn, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
                            onPress={handleGoogleSignIn}
                        >
                            <Image
                                source={require('../../assets/images/images/google.png')}
                                style={styles.socialIcon}
                                resizeMode="contain"
                            />
                            <Typo size={15} fontWeight="600" color={colors.textPrimary}>Google</Typo>
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
                            <Typo size={15} fontWeight="600" color={colors.textPrimary}>Apple</Typo>
                        </Pressable>
                    </Animated.View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Typo size={14} color={colors.textSecondary}>Already have an account?</Typo>
                        <Pressable onPress={handleNavigateToLogin}>
                            <Typo size={14} fontWeight="700" color={colors.accent}> Sign In</Typo>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    )
}

export default Register

const styles = StyleSheet.create({
    safe: { flex: 1 },
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
        alignItems: 'center',
        marginBottom: spacingY._25,
    },
    formCard: {
        gap: spacingY._15,
        paddingVertical: spacingY._20,
    },
    field: {
        gap: 6,
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
})
