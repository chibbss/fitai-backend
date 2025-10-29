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


const Login = () => {


    const emailRef = useRef('');
    const passwordRef = useRef('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async () => {
        if(!emailRef.current || !passwordRef.current ){
            Alert.alert('Login', 'Please fill all fields');
            return
        }
        router.push("/(main)/onboarding")
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS == 'ios' ? 'padding' : 'height'}
        >
            <ScreenWrapper showPattern={true}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <BackButton iconSize={38} />
                        <Typo size={17} color={colors.white}>Forgot your password?</Typo>
                    </View>

                    <View style={styles.content}>
                        <ScrollView
                            contentContainerStyle={styles.form}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={{ gap: spacingY._10, marginBottom: spacingY._15 }}>
                                <Typo size={28} fontWeight={'600'}>
                                    Welcome back
                                </Typo>

                                <Typo color={colors.neutral600}>
                                    Happy to see you
                                </Typo>

                                <Input placeholder='Enter your Email'
                                    onChangeText={(value: string) => emailRef.current = value}
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

                                <View style={{marginTop: spacingY._25, gap: spacingY._15}}>
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

                                <Button style={styles.googleButton}>
                                    <Image
                                        source={require('../../assets/images/images/google.png')}
                                        style={styles.googleIcon}
                                    />
                                    <Typo fontWeight={'bold'} color={colors.black}>
                                        Continue with Google
                                    </Typo>
                                </Button>

                                <Button style={styles.googleButton}>
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
