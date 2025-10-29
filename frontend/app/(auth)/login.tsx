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

const Login = () => {
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
        if (!emailRef.current?.trim() || !passwordRef.current?.trim()) {
            Alert.alert('Login', 'Please fill all fields');
            return
        }

        if (!validateEmail(emailRef.current)) {
            Alert.alert('Invalid email', 'Please enter a valid email address.');
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
                    Alert.alert('Login Failed', 'Incorrect email or password. Please try again.');
                }

                else if (error.message.includes('Email not confirmed')) {
                    Alert.alert(
                        'Email Not Verified',
                        'Please verify your email address before logging in. Check your inbox for the verification link.',
                        [
                            { text: 'Resend Email', onPress: () => handleResendVerification() },
                            { text: 'OK', style: 'cancel' }
                        ]
                    );
                }
                else {
                    Alert.alert('Login Error:', error.message)
                }
                setIsLoading(false);
                return;
            }

            if (!data.user || !data.session) {
                Alert.alert('Login Error', 'Failed to sign in. Please try again.');
                setIsLoading(false);
                return;
            }

            setLoadingMessage('Setting up your profile...');

            // 2. Check if user exists in backend, if not create profile
            // Small delay for better UX
            await new Promise(resolve => setTimeout(resolve, 500));

            setIsLoading(false);

            // 3. Navigate to main app
            router.replace("/(main)/chatscreen");

        }

        catch (error: any) {
            setIsLoading(false);

            // Handle network errors
            if (error.message?.includes('fetch') || error.message?.includes('network')) {
                Alert.alert(
                    'Network Error',
                    'Unable to connect. Please check your internet connection and try again.'
                );
            } else {
                Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
            }
            console.error('Login error:', error);
        }
    };

    const handleResendVerification = async () => {
        if (!emailRef.current?.trim()) {
            Alert.alert('Error', 'Please enter your email address');
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
                Alert.alert('Error', error.message);
            } else {
                Alert.alert('Success', 'Verification email sent! Please check your inbox.');
            }
        } catch (error: any) {
            setIsLoading(false);
            Alert.alert('Error', error.message || 'Failed to send verification email');
        }
    };

    const handleForgotPassword = async () => {
        if (!emailRef.current?.trim()) {
            Alert.alert('Reset Password', 'Please enter your email address first');
            return;
        }

        if (!validateEmail(emailRef.current)) {
            Alert.alert('Invalid Email', 'Please enter a valid email address');
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Sending password reset email...');

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(emailRef.current.trim());
            
            setIsLoading(false);

            if (error) {
                Alert.alert('Error', error.message);
            } else {
                Alert.alert(
                    'Check Your Email', 
                    'Password reset instructions have been sent to your email address.'
                );
            }
        } catch (error: any) {
            setIsLoading(false);
            Alert.alert('Error', error.message || 'Failed to send reset email');
        }
    };

    const handleGoogleSignIn = () => {
        Alert.alert('Coming Soon', 'Google sign-in will be available in the next update!');
    };

    const handleAppleSignIn = () => {
        Alert.alert('Coming Soon', 'Apple sign-in will be available in the next update!');
    };

    // Show full-screen loading while processing
    if (isLoading) {
        return (
            <ScreenWrapper showPattern={false}>
                <View style={styles.loadingContainer}>
                    <Loading size="large" color={colors.primary} />
                    <Typo 
                        size={18} 
                        color={colors.white} 
                        style={{ marginTop: spacingY._20, textAlign: 'center' }}
                    >
                        {loadingMessage}
                    </Typo>
                </View>
            </ScreenWrapper>
        );
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
                                    <Button loading={isLoading} onPress={handleSubmit}>
                                        <Typo fontWeight={'bold'} color={colors.black} size={20}>Login</Typo>
                                    </Button>

                                    <View style={styles.footer}>
                                        <Typo>Don't have an account?</Typo>
                                        <Pressable onPress={() => router.push("/(auth)/register")}>
                                            <Typo fontWeight={'bold'} color={colors.primaryDark}>
                                                Sign Up
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

export default Login

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
        borderWidth: 1,
        borderColor: colors.neutral300,
        paddingVertical: spacingY._12,
        borderRadius: radius.full,
        borderCurve: 'continuous',
        height: verticalScale(56),
        gap: 10,
        backgroundColor: colors.white,
        elevation: 2,
    },
    googleIcon: {
        width: 22,
        height: 22,
    },
});
