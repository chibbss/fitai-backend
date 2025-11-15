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

const Register = () => {

    const nameRef = useRef('');
    const emailRef = useRef('');
    const passwordRef = useRef('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const router = useRouter();

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

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

            setLoadingMessage('Sending verification email...');

            // 2. Create backend profile immediately (for testing without email verification)
            const token = data.session?.access_token;
            if (token) {
                try {
                    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
                    await fetch(`${apiUrl}/users/${data.user.id}`, {
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

                    // ⚡ Pre-load FitAI context for faster chat responses
                    fetch(`${apiUrl}/users/${data.user.id}/preload-context`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    })
                    .then(() => {
                        console.log('Context pre-loaded for new user');
                    })
                    .catch(err => {
                        console.warn('Context pre-load failed (non-critical):', err);
                    });
                } catch (apiError) {
                    console.error('Backend API error:', apiError);
                    // Continue anyway
                }
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
            router.replace('/onboarding');
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
            <ScreenWrapper showPattern={false}>
                <View style={styles.loadingContainer}>
                    <Typo size={18} color={colors.white}
                        style={{ marginTop: spacingY._20, textAlign: 'center' }}>
                        {loadingMessage}
                    </Typo>
                </View>
            </ScreenWrapper>
        )
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS == 'ios' ? 'padding' : 'height'}
        >
            <ScreenWrapper showPattern={false}>
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
                                    <Button loading={isLoading} onPress={handleSubmit} >
                                        <Typo fontWeight={'bold'} color={colors.black} size={20}>Sign Up</Typo>
                                    </Button>

                                    <View style={styles.footer}>
                                        <Typo>Already have an account?</Typo>
                                        <Pressable onPress={() => router.push("/login")}>
                                            <Typo fontWeight={'bold'} color={colors.primaryDark}>
                                                Login
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
});
