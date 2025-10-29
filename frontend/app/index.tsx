import { StatusBar, StyleSheet, Text, View } from 'react-native'
import React, { useEffect } from 'react'
import { colors, spacingX } from '@/constants/theme'
import { useFonts } from 'expo-font';

import Animated, { FadeInDown } from 'react-native-reanimated'
import { useRouter } from 'expo-router'

const SplashScreen = () => {
    const [fontsLoaded] = useFonts({
        Pacifico: require('../assets/fonts/Pacifico-Regular.ttf'),
    });

    
    const router = useRouter();
    useEffect(() => {
        setTimeout(() => {
            router.replace('/(auth)/welcome')
        }, 1500)
    }, [])


    return (
        <View style={styles.container}>

            <StatusBar barStyle={'light-content'} backgroundColor={colors.neutral900} />
            <Animated.Text

                entering={FadeInDown.duration(700).springify().damping(20).stiffness(80)}

                style={styles.logoText}

            >
                Fit.Ai
            </Animated.Text>
        </View>
    )
}

export default SplashScreen

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.neutral900
    },
    logoText: {
        fontFamily: 'Pacifico',
        color: 'white',
        fontSize: 104,
        letterSpacing: 1.5,
        marginBottom: spacingX._40,
        textShadowColor: 'rgba(255, 255, 255, 0.25)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
    }
})