import { View, StyleSheet, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import React, { useState, useEffect } from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { colors, radius, spacingX, spacingY } from '@/constants/theme'
import { useRouter, useLocalSearchParams } from 'expo-router'
import Button from '@/components/Button'
import Loading from '@/components/Loading'
import { supabase } from '@/utils/supabase'
import * as Icons from 'phosphor-react-native'
import { verticalScale } from '@/utils/styling'
import { alert } from '@/utils/alert';
import { useTheme } from '@/context/ThemeContext'
import BackButton from '@/components/BackButton'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
    SlideInDown,
    useSharedValue,
    withTiming,
    useAnimatedStyle,
    FadeInDown
} from 'react-native-reanimated'

const VerifyEmailOTP = () => {
    const router = useRouter();
    const { email } = useLocalSearchParams<{ email: string }>();
    const { mode, colors: themeColors } = useTheme();
    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [hasNavigated, setHasNavigated] = useState(false); // Add flag to prevent double navigation
    const opacity = useSharedValue(1);
    const translateY = useSharedValue(0);

    // Animated style for slide and fade
    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [{ translateY: translateY.value }],
        };
    });

    // Listen for auth state changes - but don't auto-navigate (we'll handle it manually)
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth event on verify OTP page:', event);

            // Don't auto-navigate - we'll handle navigation manually after showing the alert
            // This prevents the popup from appearing over the onboarding screen
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleVerifyOTP = async () => {
        if (!otp || otp.length !== 6) {
            alert.warning('Please enter a valid 6-digit OTP code', 'Invalid OTP');
            return;
        }

        if (!email) {
            alert.error('Email address not found', 'Error');
            return;
        }

        if (hasNavigated) {
            // Prevent double navigation
            return;
        }

        setIsVerifying(true);
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                email: email,
                token: otp,
                type: 'signup',
            });

            if (error) {
                alert.error(error.message, 'Verification Failed');
                setIsVerifying(false);
                return;
            }

            if (data?.user && data?.session) {
                // OTP verified successfully - create backend profile
                try {
                    const { API_URL } = await import('@/utils/config');
                    const apiUrl = API_URL.replace(/\/+$/, '');

                    const response = await fetch(`${apiUrl}/users/${data.user.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${data.session.access_token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            email: data.user.email,
                            name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
                            profile: {},
                            goals: {},
                            metadata: {
                                verified_at: new Date().toISOString(),
                                signup_source: 'mobile',
                                signup_type: 'otp',
                            },
                        }),
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('Backend profile creation error:', errorText);
                        // Don't block user - continue anyway
                    }
                } catch (apiError) {
                    console.error('Backend profile creation exception:', apiError);
                    // Don't block user from continuing even if backend fails
                }

                // Show success alert FIRST
                alert.success('Email verified successfully!', 'Success');
                
                // Wait a moment for the alert to be shown, then navigate
                // This ensures the popup appears before navigation
                setTimeout(() => {
                    if (!hasNavigated) {
                        setHasNavigated(true);
                        setIsVerifying(false);
                        router.replace('/onboarding');
                    }
                }, 1500); // 1.5 seconds - enough time for alert to show
            } else {
                setIsVerifying(false);
            }
        } catch (error: any) {
            console.error('OTP verification error:', error);
            alert.error(error.message || 'Failed to verify OTP', 'Error');
            setIsVerifying(false);
        }
    };

    const handleResendOTP = async () => {
        if (!email) {
            Alert.alert('Error', 'Email address not found');
            return;
        }

        setIsResending(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
            });

            if (error) {
                Alert.alert('Error', error.message);
            } else {
                Alert.alert('Success', 'OTP code sent! Check your email.');
                setOtp(''); // Clear the OTP input
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to resend OTP');
        } finally {
            setIsResending(false);
        }
    };

    if (isVerifying) {
        return (
            <ScreenWrapper showPattern={false}>
                <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
                    <Animated.View entering={FadeInDown.delay(150).springify()}>
                        <Loading size="large" color={themeColors.accentPrimary} />
                    </Animated.View>
                    <Animated.View entering={FadeInDown.delay(300).springify()}>
                        <Typo
                            size={18}
                            color={themeColors.textPrimary}
                            style={{ marginTop: spacingY._20, textAlign: 'center' }}
                        >
                            Verifying OTP...
                        </Typo>
                    </Animated.View>
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScreenWrapper showPattern={false} bgOpacity={0.5}>
                <Animated.View
                    entering={SlideInDown.delay(300).springify()}
                    style={[{ flex: 1 }, animatedStyle]}
                >
                    <View style={styles.container}>
                        <View style={styles.header}>
                            <BackButton iconSize={38} />
                            <Typo size={17} color={colors.white}>Need Help?</Typo>
                        </View>

                        <View style={[styles.content, { backgroundColor: themeColors.cardBackground || colors.white }]}>
                            <ScrollView
                                contentContainerStyle={styles.form}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                <View style={{ gap: spacingY._10, marginBottom: spacingY._15 }}>
                                    <View style={{ alignItems: 'center', justifyContent: 'space-between', gap: spacingY._10 }}>
                                        <View style={styles.iconContainer}>
                                            <Icons.ShieldCheck size={verticalScale(60)} color={themeColors.accentPrimary} weight="light" />
                                        </View>

                                        <Typo size={28} fontWeight="600" color={themeColors.textPrimary}>
                                            Enter OTP Code
                                        </Typo>



                                        <Typo color={themeColors.accentPrimary} size={18} fontWeight="600">
                                            {email}
                                        </Typo>
                                    </View>


                                    <View style={styles.otpContainer}>
                                        <TextInput
                                            style={[
                                                styles.otpInput,
                                                {
                                                    backgroundColor: themeColors.cardBackground || colors.neutral100,
                                                    borderColor: otp.length === 6
                                                        ? themeColors.accentPrimary
                                                        : (themeColors.border || colors.neutral200),
                                                    color: themeColors.textPrimary,
                                                }
                                            ]}
                                            value={otp}
                                            onChangeText={(text) => {
                                                // Only allow numbers and limit to 6 digits
                                                const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
                                                setOtp(numericText);
                                            }}
                                            placeholder="000000"
                                            placeholderTextColor={themeColors.textSecondary || colors.neutral400}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            autoFocus={true}
                                            textAlign="center"
                                        />
                                    </View>

                                    <Typo color={themeColors.textSecondary || colors.neutral500} size={14} style={styles.instructions}>
                                        Enter the 6-digit code from your email to verify your account
                                    </Typo>

                                    <View style={{ marginTop: spacingY._25, gap: spacingY._15 }}>
                                        <LinearGradient
                                            colors={themeColors.accentGradient as any}
                                            start={{ x: 0, y: 0.5 }}
                                            end={{ x: 1, y: 0.5 }}
                                            style={styles.buttonGradient}
                                        >
                                            <Button
                                                loading={isVerifying}
                                                onPress={handleVerifyOTP}
                                                style={{ backgroundColor: 'transparent' }}
                                                disabled={otp.length !== 6}
                                            >
                                                <Typo fontWeight="bold" color={themeColors.background} size={20}>
                                                    Verify OTP
                                                </Typo>
                                            </Button>
                                        </LinearGradient>

                                        <Button
                                            onPress={handleResendOTP}
                                            style={[
                                                styles.secondaryButton,
                                                {
                                                    backgroundColor: themeColors.cardBackground || colors.white,
                                                    borderColor: themeColors.accentPrimary,
                                                }
                                            ]}
                                            disabled={isResending}
                                        >
                                            <Typo fontWeight="600" color={themeColors.accentPrimary} size={16}>
                                                {isResending ? 'Sending...' : 'Resend OTP'}
                                            </Typo>
                                        </Button>

                                        <View style={styles.footer}>
                                            <Typo color={themeColors.textSecondary || colors.neutral600} size={14}>
                                                Back to{' '}
                                            </Typo>
                                            <Pressable onPress={() => router.replace('/login')}>
                                                <Typo fontWeight="bold" color={themeColors.accentPrimary} size={14}>
                                                    Login
                                                </Typo>
                                            </Pressable>
                                        </View>
                                    </View>
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </Animated.View>
            </ScreenWrapper>
        </KeyboardAvoidingView>
    )
}

export default VerifyEmailOTP

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'space-between',
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
    iconContainer: {
        alignItems: 'center',
        marginBottom: spacingY._10,
    },
    otpContainer: {
        width: '100%',
        marginTop: spacingY._10,
        marginBottom: spacingY._10,
    },
    otpInput: {
        width: '100%',
        height: 60,
        borderRadius: 12,
        fontSize: 24,
        fontWeight: '600',
        letterSpacing: 8,
        borderWidth: 2,
    },
    instructions: {
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonGradient: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    secondaryButton: {
        borderWidth: 1.5,
        paddingVertical: spacingY._12,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: spacingY._10,
    },
})
