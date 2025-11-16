import { StyleSheet, View } from 'react-native'
import React from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { colors, spacingX, spacingY } from '@/constants/theme'
import { verticalScale } from '@/utils/styling'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import Button from '@/components/Button'
import { useRouter } from 'expo-router'

const Welcome = () => {
    const router = useRouter();

    return (
        <ScreenWrapper showPattern={false} bgOpacity={0.5}>
            <View style={styles.container}>
                {/* --- Image Section --- */}

                

                {/* --- Text Section --- */}
                <View style={styles.textSection}>
                    <View style={styles.headlineContainer}>
                        <Typo color={colors.white} size={36} fontWeight="800" >
                            Transform Your Body.
                        </Typo>
                        <Typo color={colors.white} size={36} fontWeight="800" >
                            Boost Your Mind.
                        </Typo>
                        <Typo color={colors.white} size={36} fontWeight="800">
                            Welcome to
                        </Typo>
                    </View>

                    <Animated.Text
                        entering={FadeInDown.duration(700).springify().damping(20).stiffness(80)}
                        style={styles.logoText}
                    >
                        <Typo color={colors.white} size={68}>
                            Fit.Ai
                        </Typo>
                    </Animated.Text>
                </View>

                {/* --- Button Section --- */}
                <View style={styles.buttonContainer}>
                    <Button
                        style={styles.button}
                        onPress={() => router.push('/register' as any)}
                    >
                        <Typo size={23} fontWeight="bold">Get Started</Typo>
                    </Button>
                </View>

            </View>
        </ScreenWrapper>
    )
}

export default Welcome

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacingX._10,
        paddingVertical: spacingY._15, // reduced to bring text up
    },

    textSection: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        marginTop: verticalScale(40),
    },

    headlineContainer: {
        marginBottom: spacingY._20,
        alignItems: 'center',
        gap: verticalScale(4),
    },

    logoText: {
        fontFamily: 'Pacifico',
        color: colors.white,
        letterSpacing: 1.5,
        textShadowColor: 'rgba(255, 255, 255, 0.25)',
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 10,
    },

    buttonContainer: {
        width: '100%',
        alignItems: 'center',
        marginBottom: spacingY._30,
    },

    button: {
        width: '80%',
        backgroundColor: colors.primary,
        borderRadius: 14,
        paddingVertical: spacingY._12,
    },
    
})
