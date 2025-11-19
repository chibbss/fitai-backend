import { StatusBar, StyleSheet, View, Platform, Image } from 'react-native'
import React, { useEffect, useState } from 'react'
import { colors, spacingX } from '@/constants/theme'
import { useFonts } from 'expo-font';
import { SafeAreaView } from 'react-native-safe-area-context';

import Animated, { FadeInDown } from 'react-native-reanimated'
import { useRootNavigationState, useRootNavigation, useRouter } from 'expo-router'

import logo from '@/assets/images/FitIcon.png';

const SplashScreen = () => {
    const [fontsLoaded, fontError] = useFonts({
        Pacifico: require('../assets/fonts/Pacifico-Regular.ttf'),
    });

    const router = useRouter();
    const rootNavigation = useRootNavigation();
    const rootState = useRootNavigationState();
    const [shouldNavigate, setShouldNavigate] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Wait for fonts to load before showing content
    useEffect(() => {
        if (fontError) {
            console.error('Font loading error:', fontError);
            setIsReady(true);
            setShouldNavigate(true);
            return;
        }
        if (fontsLoaded) {
            setIsReady(true);
            const timeout = setTimeout(() => {
                setShouldNavigate(true);
            }, 1500);
            return () => clearTimeout(timeout);
        }
    }, [fontsLoaded, fontError]);

    useEffect(() => {
        if (!shouldNavigate) return;

        const navigate = () => {
            try {
                if (rootState?.key && rootNavigation?.isReady()) {
                    router.replace('/welcome');
                }
            } catch (error) {
                console.error('Navigation error:', error);
                setTimeout(() => {
                    try {
                        router.replace('/welcome');
                    } catch (e) {
                        console.error('Retry navigation error:', e);
                    }
                }, 1000);
            }
        };

        navigate();
    }, [router, shouldNavigate, rootState?.key, rootNavigation]);

    return (
        <View style={styles.wrapper}>
            <StatusBar
                barStyle="light-content"
                backgroundColor={colors.deepCharcoal}
                translucent={Platform.OS === 'android'}
            />
            <SafeAreaView
                style={styles.container}
                edges={['top', 'bottom', 'left', 'right']}
            >
                {isReady && (
                    <Animated.Image
                        entering={FadeInDown.duration(700).springify().damping(20).stiffness(80)}
                        style={styles.logoImage}
                        source={logo}
                        resizeMode='contain'
                    />
                )}
            </SafeAreaView>
        </View>
    )
}

export default SplashScreen

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: colors.deepCharcoal,
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.deepCharcoal,
        width: '100%',
    },
    logoText: {
        fontFamily: 'Pacifico',
        color: colors.white,
        fontSize: 104,
        letterSpacing: 1.5,
        textAlign: 'center',
        textShadowColor: 'rgba(255, 255, 255, 0.25)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
        // Prevent overflow
        maxWidth: '90%',
        paddingHorizontal: spacingX._20,
    },
    logoImage: {
        width: 360,
        height: 360
    }
})