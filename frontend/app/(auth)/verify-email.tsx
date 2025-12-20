import { View, StyleSheet, Pressable, Alert, Linking, Platform } from 'react-native'
import React, { useState, useEffect } from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { colors, spacingX, spacingY } from '@/constants/theme'
import { useRouter, useLocalSearchParams } from 'expo-router'
import Button from '@/components/Button'
import Loading from '@/components/Loading'
import { supabase, getAuthRedirectUrl } from '@/utils/supabase'
import * as Icons from 'phosphor-react-native'
import { verticalScale } from '@/utils/styling'
import { alert } from '@/utils/alert';

const VerifyEmail = () => {
    const router = useRouter();
    const { email } = useLocalSearchParams<{ email: string }>();
    const [isResending, setIsResending] = useState(false);

    // Listen for auth state changes
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth event on verify page:', event);
            
            if (event === 'SIGNED_IN' && session) {
                // User verified their email and is now signed in
                console.log('User signed in after verification');
                router.replace('/onboarding');
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleResendEmail = async () => {
        if (!email) {
            Alert.alert('Error', 'Email address not found');
            return;
        }

        setIsResending(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
                options: {
                    emailRedirectTo: getAuthRedirectUrl(),
                },
            });

            if (error) {
                Alert.alert('Error', error.message);
            } else {
                Alert.alert('Success', 'Verification email sent! Check your inbox.');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to resend email');
        } finally {
            setIsResending(false);
        }
    };

    const handleOpenEmail = async () => {
        try {
            // Try different strategies based on platform
            if (Platform.OS === 'ios') {
                // iOS: Try to open Mail app to inbox
                const mailUrl = 'message://';
                const canOpenMail = await Linking.canOpenURL(mailUrl);
                
                if (canOpenMail) {
                    await Linking.openURL(mailUrl);
                } else {
                    // Fallback to mailto which opens default mail client
                    const mailtoUrl = email ? `mailto:${email}` : 'mailto:';
                    await Linking.openURL(mailtoUrl);
                }
            } else if (Platform.OS === 'android') {
                // Android: Use intent to open Gmail/Email app directly to inbox
                try {
                    // Try Gmail first (most common)
                    const gmailUrl = 'googlegmail://';
                    const canOpenGmail = await Linking.canOpenURL(gmailUrl);
                    
                    if (canOpenGmail) {
                        await Linking.openURL(gmailUrl);
                    } else {
                        // Try generic email intent
                        // This opens the email app chooser if multiple apps are installed
                        const emailIntent = 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end';
                        const canOpenIntent = await Linking.canOpenURL(emailIntent);
                        
                        if (canOpenIntent) {
                            await Linking.openURL(emailIntent);
                        } else {
                            // Final fallback to mailto
                            await Linking.openURL('mailto:');
                        }
                    }
                } catch (androidError) {
                    console.log('Android email opening fallback:', androidError);
                    // Fallback to mailto
                    await Linking.openURL('mailto:');
                }
            } else {
                // Web or other platforms
                await Linking.openURL('mailto:');
            }
        } catch (error) {
            console.error('Error opening email app:', error);
            // If all else fails, show helpful instructions
            Alert.alert(
                'Check Your Email',
                `We've sent a verification link to ${email}.\n\nPlease open your email app and look for an email from Supabase. Click the verification link to continue.`,
                [{ text: 'OK' }]
            );
        }
    };

    if (isResending) {
        return (
            <ScreenWrapper showPattern={false}>
                <View style={styles.loadingContainer}>
                    <Loading size="large" color={colors.primary} />
                    <Typo
                        size={18}
                        color={colors.white}
                        style={{ marginTop: spacingY._20, textAlign: 'center' }}
                    >
                        Sending verification email...
                    </Typo>
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper showPattern={false}>
            <View style={styles.container}>
                <View style={styles.content}>
                    <View style={styles.iconContainer}>
                        <Icons.EnvelopeSimple size={verticalScale(80)} color={colors.primary} weight="light" />
                    </View>

                    <Typo size={32} fontWeight="700" style={styles.title}>
                        Check Your Email
                    </Typo>

                    <Typo color={colors.neutral600} size={16} style={styles.description}>
                        We've sent a verification link to
                    </Typo>

                    <Typo color={colors.primaryDark} size={18} fontWeight="600" style={styles.email}>
                        {email}
                    </Typo>

                    <Typo color={colors.neutral500} size={14} style={styles.instructions}>
                        Click the link in the email to verify your account and start your fitness journey!
                    </Typo>

                    <View style={styles.buttonContainer}>
                        <Button onPress={handleOpenEmail} style={styles.primaryButton}>
                            <Typo fontWeight="bold" color={colors.black} size={18}>
                                Open Email App
                            </Typo>
                        </Button>

                        <Button onPress={handleResendEmail} style={styles.secondaryButton}>
                            <Typo fontWeight="600" color={colors.primaryDark} size={16}>
                                Resend Verification Email
                            </Typo>
                        </Button>

                        <Pressable onPress={() => router.replace('/login')} style={styles.backToLogin}>
                            <Typo color={colors.neutral600} size={14}>
                                Back to{' '}
                                <Typo fontWeight="bold" color={colors.primaryDark}>
                                    Login
                                </Typo>
                            </Typo>
                        </Pressable>
                    </View>
                </View>
            </View>
        </ScreenWrapper>
    )
}

export default VerifyEmail

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacingX._20,
    },

    content: {
        width: '100%',
        alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: 24,
        padding: spacingY._30,
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainer: {
        marginBottom: spacingY._20,
    },
    title: {
        marginBottom: spacingY._10,
        textAlign: 'center',
    },
    description: {
        marginBottom: spacingY._5,
        textAlign: 'center',
    },
    email: {
        marginBottom: spacingY._15,
        textAlign: 'center',
    },

    instructions: {
        marginBottom: spacingY._30,
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonContainer: {
        width: '100%',
        gap: spacingY._15,
    },
    primaryButton: {
        backgroundColor: colors.primary,
        paddingVertical: spacingY._15,
    },
    secondaryButton: {
        backgroundColor: colors.white,
        borderWidth: 1.5,
        borderColor: colors.primaryDark,
        paddingVertical: spacingY._12,
    },

    backToLogin: {
        marginTop: spacingY._10,
        alignSelf: 'center',
    },
})
