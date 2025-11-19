import { StyleSheet, View, TouchableOpacity } from 'react-native'
import React from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import LavaLamp from '@/components/LavaLamp'
import Typo from '@/components/Typo'
import { colors, spacingX, spacingY } from '@/constants/theme'
import { useRouter } from 'expo-router'
import BackButton from '@/components/BackButton'

const LavaLampTest = () => {
    const router = useRouter();

    return (
        <View style={styles.screenContainer}>
            {/* LavaLamp background */}
            <View style={styles.lavaLampContainer}>
                <LavaLamp />
            </View>
            
            {/* Optional dark overlay for better text readability - adjust opacity as needed */}
            <View style={styles.overlay} />
            
            {/* Content */}
            <ScreenWrapper showPattern={false} bgOpacity={0}>
                <View style={styles.container}>
                    {/* Back Button */}
                    <View style={styles.header}>
                        <BackButton />
                    </View>
                    
                    {/* Test Content */}
                    <View style={styles.content}>
                        <Typo color={colors.white} size={32} fontWeight="800" style={styles.title}>
                            LavaLamp Test
                        </Typo>
                        <Typo color={colors.white} size={18} style={styles.description}>
                            This is a test screen for the LavaLamp component
                        </Typo>
                    </View>
                    
                    {/* Test Button */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity 
                            style={styles.button}
                            onPress={() => router.push('/welcome' as any)}
                        >
                            <Typo size={18} color={colors.white} fontWeight="bold">
                                Back to Welcome
                            </Typo>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScreenWrapper>
        </View>
    )
}

export default LavaLampTest

const styles = StyleSheet.create({
    screenContainer: {
        flex: 1,
    },
    lavaLampContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.neutral900,
        opacity: 0.2, // Adjust this value (0-1) to control darkness over LavaLamp
        zIndex: 1,
    },
    container: {
        flex: 1,
        paddingHorizontal: spacingX._10,
        paddingVertical: spacingY._15,
        zIndex: 2,
    },
    header: {
        marginTop: 40,
        marginBottom: 20,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
    },
    title: {
        textAlign: 'center',
        marginBottom: 10,
    },
    description: {
        textAlign: 'center',
        opacity: 0.9,
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
        alignItems: 'center',
        justifyContent: 'center',
    },
})