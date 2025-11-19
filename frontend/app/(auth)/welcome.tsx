import Button from '@/components/Button'
import PulseLogo from '@/components/PulseLogo'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { radius, spacingX, spacingY } from '@/constants/theme'
import { useTheme } from '@/context/ThemeContext'
import { verticalScale } from '@/utils/styling'
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_800ExtraBold, useFonts } from '@expo-google-fonts/poppins'
import MaskedView from '@react-native-masked-view/masked-view'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from 'react-native-reanimated'



const Welcome = () => {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_600SemiBold,
        Poppins_800ExtraBold,
    });
    const router = useRouter();
    const { mode, colors: themeColors, setPreference } = useTheme();
    const isDarkMode = mode === 'dark';
    const [isNavigating, setIsNavigating] = useState(false);
    const [animationKey, setAnimationKey] = useState(0);


    const opacity = useSharedValue(1);

    useFocusEffect(
        React.useCallback(() => {
            opacity.value = 1;
            setIsNavigating(false);
            setAnimationKey(prev => prev + 1);

        }, [])
    );

    const navigateToRegister = () => {
        router.push('/register' as any);
    };

    const GradientText = ({ text }: { text: string }) => (
        <MaskedView
            style={[styles.gradientTextContainer, { marginBottom: -2 }]}

            maskElement={
                <Typo size={40} fontWeight="800">{text}</Typo>
            }>
            <LinearGradient
                colors={themeColors.accentGradient}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
            >
                <Typo size={40} fontWeight="800" style={{ opacity: 0 }}>
                    {text}
                </Typo>
            </LinearGradient>
        </MaskedView>
    );

    const handleThemeToggle = (nextValue: boolean) => {
        setPreference(nextValue ? 'dark' : 'light');
    };

    const handleNavigateToRegister = () => {
        setIsNavigating(true);
        opacity.value = withTiming(0, { duration: 300 });

        setTimeout(() => {
            navigateToRegister();
        }, 150)
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
        };
    });


    return (
        <ScreenWrapper showPattern={false} bgOpacity={0.5} /*backgroundImage={require('@/assets/images/fitness-app-assets/welcome.png')}*/>
            <Animated.View
                style={[{ flex: 1 }, animatedStyle]}
            >
                {fontsLoaded && (
                    <View style={styles.container} key={animationKey}>

                        {/*}
                    <LinearGradient
                        colors={['transparent', '#18181b']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.gradientOverlay}
                    />
                    <View style={styles.themeSwitcher}>
                        <ThemeToggleButton />
                    </View>*/}


                        {/*Logo Section*/}
                        <View style={styles.logoSection}>

                            <Animated.View
                                entering={FadeInDown.delay(150).springify()}

                            >
                                <PulseLogo size={verticalScale(250)} />
                            </Animated.View>

                            <Animated.View
                                entering={FadeInDown.delay(150).springify()}
                                style={styles.logoTextContainer}
                            >
                                <View style={styles.logoTextRow}>
                                    <Text style={[styles.logoText, { color: themeColors.textPrimary }]}>fit</Text>



                                    <MaskedView
                                        style={styles.dotMask}
                                        maskElement={
                                            <Text style={styles.logoText}>.</Text>
                                        }
                                    >
                                        <LinearGradient
                                            colors={themeColors.accentGradient}
                                            start={{ x: 0, y: 0.5 }}
                                            end={{ x: 1, y: 0.5 }}
                                        >
                                            <Text style={[styles.logoText, { opacity: 0 }]}>.</Text>
                                        </LinearGradient>
                                    </MaskedView>

                                    <Text style={[styles.logoText, { color: themeColors.textPrimary }]}>ai</Text>

                                </View>
                            </Animated.View>


                        </View>

                        {/* --- Text Section --- */}
                        <View style={styles.textSection}>
                            <Animated.View
                                entering={FadeInDown.delay(100).springify()}
                                style={styles.headlineContainer}
                            >
                                <View style={styles.headlineRow}>
                                    <GradientText text="Transform" />
                                    <Typo color={themeColors.textPrimary} size={31} fontWeight="800">
                                        {' '}Your Body.
                                    </Typo>
                                </View>

                                <View style={styles.headlineRow}>
                                    <Typo color={themeColors.textPrimary} size={31} fontWeight="800">
                                        Boost Your{' '}
                                    </Typo>
                                    <GradientText text="Mind." />
                                </View>

                            </Animated.View>
                        </View>

                        {/* --- Button Section --- */}
                        <Animated.View
                            entering={FadeInDown.delay(200).springify()}
                            style={styles.buttonContainer}
                        >
                            <LinearGradient
                                colors={themeColors.accentGradient}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={styles.buttonGradient}
                            >

                                <Button
                                    style={[styles.button, { backgroundColor: 'transparent' }]}
                                    onPress={handleNavigateToRegister}

                                >
                                    <Typo size={23} color={themeColors.background} fontWeight="bold">Get Started</Typo>
                                </Button>
                            </LinearGradient>
                        </Animated.View>


                    </View >)}
            </Animated.View>
        </ScreenWrapper >
    )
}

export default Welcome

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: spacingX._10,
    },

    /*     gradientOverlay: {
             position: 'absolute',
             top: 0,
             left: 0,
             right: 0,
             bottom: 0,
             zIndex: 0,
         },*/

    logoSection: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        flexDirection: 'row',
        marginTop: 120,
        marginRight: 75
    },

    logoTextContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },

    logoTextRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 10
    },
    logoText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: verticalScale(68),
        letterSpacing: -4.5,
        textShadowColor: 'rgba(255, 255, 255, 0.25)',
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 80,
        marginTop: spacingX._40
    },


    dotMask: {
        justifyContent: 'center',
        marginLeft: 3
    },


    textSection: {
        flex: 1,
        alignItems: 'center',
        marginBottom: spacingY._60,
        justifyContent: 'flex-end'
    },

    headlineContainer: {

        alignItems: 'center',
        gap: verticalScale(4),
        width: '100%',
    },

    headlineText: {
        textAlign: 'center',
        width: '100%',
    },



    logoWrapper: {
        width: verticalScale(580),
        height: verticalScale(420),
        alignSelf: 'center',
        justifyContent: 'center',
    },
    logoAbsolute: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hidden: {
        pointerEvents: 'none',
        opacity: 0,
    },

    buttonContainer: {
        width: '100%',
        alignItems: 'center',
        marginBottom: spacingY._30,
    },



    buttonGradient: {
        width: '80%',
        borderRadius: radius.full,
        overflow: 'hidden',
        alignSelf: 'center',
    },

    button: {
        width: '100%',
        
        borderRadius: radius.full,
        borderStyle: 'solid',
        borderColor: 'white',
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },

    themeSwitcher: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: spacingY._10,
        marginRight: spacingX._10,
        zIndex: 1
    },

    headlineRow: {
        flexDirection: 'row',
        alignItems: 'baseline',        // forces children to share a baseline
        justifyContent: 'center',
    },
})
