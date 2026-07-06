import PulseLogo from '@/components/PulseLogo'
import Typo from '@/components/Typo'
import { GradientButton } from '@/components/ui'
import { spacingX, spacingY } from '@/constants/theme'
import { useTheme } from '@/context/ThemeContext'
import { verticalScale } from '@/utils/styling'
import { useRouter } from 'expo-router'
import React from 'react'
import { StatusBar, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

const Welcome = () => {
    const router = useRouter()
    const { colors } = useTheme()

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />

            <View style={styles.container}>

                {/* Animated logo */}
                <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.logoSection}>
                    <PulseLogo size={verticalScale(200)} />
                </Animated.View>

                {/* Brand name + subtitle */}
                <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.textSection}>
                    <Typo size={44} fontWeight="800" color={colors.textPrimary} style={styles.title}>
                        Fit . AI
                    </Typo>
                    <Typo size={16} color={colors.textSecondary} style={styles.subtitle}>
                        Transform Your Body Boost Your Mind
                    </Typo>
                </Animated.View>

                {/* CTA */}
                <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.cta}>
                    <GradientButton
                        title="Get Started"
                        onPress={() => router.push('/register' as any)}
                        style={{ width: '100%' }}
                    />
                </Animated.View>

                {/* Tagline */}
                <Animated.View entering={FadeInDown.delay(380).springify()}>
                    <Typo size={13} color={colors.textMuted} style={styles.tagline}>
                        Your personal AI training companion
                    </Typo>
                </Animated.View>

            </View>
        </SafeAreaView>
    )
}

export default Welcome

const styles = StyleSheet.create({
    safe: { flex: 1 },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacingX._20,
        gap: spacingY._20,
    },
    logoSection: {
        alignItems: 'center',
    },
    textSection: {
        alignItems: 'center',
        gap: 8,
        marginTop: -spacingY._10,   // pull text up slightly under the logo
    },
    title: {
        letterSpacing: -1.5,
    },
    subtitle: {
        textAlign: 'center',
    },
    cta: {
        width: '100%',
        marginTop: spacingY._10,
    },
    tagline: {
        textAlign: 'center',
    },
})