import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    interpolate,
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Typo from './Typo';
import { useTheme } from '@/context/ThemeContext';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { verticalScale, scale } from '@/utils/styling';

interface TypingIndicatorProps {
    caption?: string;
    showWordmark?: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
    caption = 'Thinking...',
    showWordmark = true,
}) => {
    const { colors: themeColors } = useTheme();

    // Animation values for dots
    const dot1Y = useSharedValue(0);
    const dot2Y = useSharedValue(0);
    const dot3Y = useSharedValue(0);
    const dot1Opacity = useSharedValue(0.7);
    const dot2Opacity = useSharedValue(0.7);
    const dot3Opacity = useSharedValue(0.7);

    // Animation values for gradient sweep
    const gradientPosition = useSharedValue(0);

    // Animation values for pulsing dot
    const dotScale = useSharedValue(1);
    const dotGlow = useSharedValue(0.6);

    useEffect(() => {
        // Dot animation - typing bounce
        const animateDots = () => {
            const bounceUp = 300;
            const bounceDown = 300;
            const rest = 400;
            const totalCycle = bounceUp + bounceDown + rest; // 1000ms - all dots use this

            // Stagger delay between each dot (200ms)
            const stagger = Math.floor(totalCycle / 3);

            // Dot 1: starts immediately, full cycle
            dot1Y.value = withRepeat(
                withSequence(
                    withTiming(-4, { duration: bounceUp, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: bounceDown, easing: Easing.in(Easing.quad) }),
                    withTiming(0, { duration: rest })
                ),
                -1,
                false
            );

            dot1Opacity.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: bounceUp }),
                    withTiming(0.7, { duration: bounceDown }),
                    withTiming(0.7, { duration: rest })
                ),
                -1,
                false
            );

            // Dot 2: starts 200ms later, but cycle must still be 1000ms total
            // So: wait 200ms, then bounce (600ms), then rest (200ms) = 1000ms
            const dot2Rest = totalCycle - stagger - bounceUp - bounceDown; // 1000 - 333 - 300 - 300 = 67ms

            dot2Y.value = withRepeat(
                withSequence(
                    withTiming(0, { duration: stagger }), // Wait 333ms
                    withTiming(-4, { duration: bounceUp, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: bounceDown, easing: Easing.in(Easing.quad) }),
                    withTiming(0, { duration: dot2Rest }) // Rest 67ms to complete 1000ms cycle
                ),
                -1,
                false
            );

            dot2Opacity.value = withRepeat(
                withSequence(
                    withTiming(0.7, { duration: stagger }),
                    withTiming(1, { duration: bounceUp }),
                    withTiming(0.7, { duration: bounceDown }),
                    withTiming(0.7, { duration: dot2Rest })
                ),
                -1,
                false
            );

            // Dot 3: starts 400ms later, cycle must still be 1000ms total
            // So: wait 400ms, then bounce (600ms), then rest (0ms) = 1000ms
            const dot3Delay = stagger * 2; // 666ms
            const dot3Rest = Math.max(0, rest - (dot3Delay - (bounceUp + bounceDown)));

            dot3Y.value = withRepeat(
                withSequence(
                    withTiming(0, { duration: dot3Delay }), // Wait 666ms
                    withTiming(-4, { duration: bounceUp, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: bounceDown, easing: Easing.in(Easing.quad) }),
                    withTiming(0, { duration: dot3Rest })
                ),
                -1,
                false
            );

            dot3Opacity.value = withRepeat(
                withSequence(
                    withTiming(0.7, { duration: dot3Delay }),
                    withTiming(1, { duration: bounceUp }),
                    withTiming(0.7, { duration: bounceDown }),
                    withTiming(0.7, { duration: dot3Rest })
                ),
                -1,
                false
            );
        }

        // Gradient sweep animation
        const animateGradient = () => {
            gradientPosition.value = withRepeat(
                withTiming(1, {
                    duration: 3000,
                    easing: Easing.inOut(Easing.ease),
                }),
                -1,
                true
            );
        };

        // Pulsing dot animation
        const animateDot = () => {
            dotScale.value = withRepeat(
                withSequence(
                    withTiming(1.15, {
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withTiming(1, {
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                    })
                ),
                -1,
                false
            );

            dotGlow.value = withRepeat(
                withSequence(
                    withTiming(0.9, {
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withTiming(0.6, {
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                    })
                ),
                -1,
                false
            );
        };

        animateDots();


    }, []);

    // Animated styles for dots
    const dot1Style = useAnimatedStyle(() => ({
        transform: [{ translateY: dot1Y.value }],
        opacity: dot1Opacity.value,
    }));

    const dot2Style = useAnimatedStyle(() => ({
        transform: [{ translateY: dot2Y.value }],
        opacity: dot2Opacity.value,
    }));

    const dot3Style = useAnimatedStyle(() => ({
        transform: [{ translateY: dot3Y.value }],
        opacity: dot3Opacity.value,
    }));

    // Animated style for gradient sweep
    const gradientStyle = useAnimatedStyle(() => {
        const startX = interpolate(gradientPosition.value, [0, 1], [-200, 200]);
        return {
            transform: [{ translateX: startX }],
        };
    });

    // Animated style for pulsing dot
    const dotPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: dotScale.value }],
    }));

    const dotGlowStyle = useAnimatedStyle(() => ({
        opacity: dotGlow.value,
    }));

    return (
        <View style={styles.container}>
            {/*<LinearGradient
                colors={[
                    'rgba(0,255,200,0.12)',
                    'rgba(0,228,255,0.08)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBackground}
            >*/}
                {/*<View style={styles.borderOverlay} />*/}

                <View style={styles.content}>
                    {caption && (
                        <Typo
                            size={16}
                            color="#67f9e3"
                            style={styles.caption}
                        >
                            {caption.toUpperCase()}
                        </Typo>
                    )}

                    {showWordmark && (
                        <View style={styles.wordmarkContainer}>
                            <View style={styles.wordmark}>
                                {/* "fit" with gradient sweep */}
                                {/*<MaskedView
                                    style={styles.maskedText}
                                    maskElement={
                                        <Typo
                                            size={32}
                                            fontWeight="600"
                                            style={styles.wordmarkText}
                                        >
                                            fit
                                        </Typo>
                                    }
                                >
                                    <Animated.View style={[styles.gradientWrapper, gradientStyle]}>
                                        <LinearGradient
                                            colors={[
                                                'rgba(28,217,176,0.35)',
                                                'rgba(0,228,255,0.9)',
                                                'rgba(28,217,176,0.35)',
                                            ]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.gradientText}
                                        >
                                            <Typo
                                                size={32}
                                                fontWeight="600"
                                                style={[styles.wordmarkText, { opacity: 0 }]}
                                            >
                                                fit
                                            </Typo>
                                        </LinearGradient>
                                    </Animated.View>
                                </MaskedView>*/}

                                {/* Pulsing dot */}
                                {/*<Animated.View style={dotPulseStyle}>
                                    <Animated.View style={dotGlowStyle}>
                                        <Typo
                                            size={32}
                                            fontWeight="600"
                                            color="#ff6b88"
                                            style={[
                                                styles.wordmarkText,
                                                styles.dotText,
                                            ]}
                                        >
                                            .
                                        </Typo>
                                    </Animated.View>
                                </Animated.View>*/}

                                {/* "ai" with gradient sweep */}
                                {/*<MaskedView
                                    style={styles.maskedText}
                                    maskElement={
                                        <Typo
                                            size={32}
                                            fontWeight="600"
                                            style={styles.wordmarkText}
                                        >
                                            ai
                                        </Typo>
                                    }
                                >
                                    <Animated.View style={[styles.gradientWrapper, gradientStyle]}>
                                        <LinearGradient
                                            colors={[
                                                'rgba(28,217,176,0.35)',
                                                'rgba(0,228,255,0.9)',
                                                'rgba(28,217,176,0.35)',
                                            ]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.gradientText}
                                        >
                                            <Typo
                                                size={32}
                                                fontWeight="600"
                                                style={[styles.wordmarkText, { opacity: 0 }]}
                                            >
                                                ai
                                            </Typo>
                                        </LinearGradient>
                                    </Animated.View>
                                </MaskedView>*/}
                            </View>

                            {/* Typing dots */}
                            <View style={styles.dotsContainer}>
                                <Animated.View style={[styles.dot, dot1Style]}>
                                    <View
                                        style={[
                                            styles.dotInner,
                                            { backgroundColor: themeColors.accentPrimary },
                                        ]}
                                    />
                                </Animated.View>
                                <Animated.View style={[styles.dot, dot2Style]}>
                                    <View
                                        style={[
                                            styles.dotInner,
                                            { backgroundColor: themeColors.accentPrimary },
                                        ]}
                                    />
                                </Animated.View>
                                <Animated.View style={[styles.dot, dot3Style]}>
                                    <View
                                        style={[
                                            styles.dotInner,
                                            { backgroundColor: themeColors.accentPrimary },
                                        ]}
                                    />
                                </Animated.View>
                            </View>
                        </View>
                    )}

                    {!showWordmark && (
                        <View style={styles.dotsContainer}>
                            <Animated.View style={[styles.dot, dot1Style]}>
                                <View
                                    style={[
                                        styles.dotInner,
                                        { backgroundColor: themeColors.accentPrimary },
                                    ]}
                                />
                            </Animated.View>
                            <Animated.View style={[styles.dot, dot2Style]}>
                                <View
                                    style={[
                                        styles.dotInner,
                                        { backgroundColor: themeColors.accentPrimary },
                                    ]}
                                />
                            </Animated.View>
                            <Animated.View style={[styles.dot, dot3Style]}>
                                <View
                                    style={[
                                        styles.dotInner,
                                        { backgroundColor: themeColors.accentPrimary },
                                    ]}
                                />
                            </Animated.View>
                        </View>
                    )}


                </View>
            {/*</LinearGradient>*/}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    /*gradientBackground: {
        borderRadius: radius._15 || 14,
        padding: spacingY._20 || 18,
        paddingHorizontal: spacingX._20 || 20,
        position: 'relative',
        overflow: 'hidden',
    },
    borderOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius._15 || 14,
        borderWidth: 1,
        borderColor: 'rgba(0,255,200,0.15)',
        pointerEvents: 'none',
    },*/
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10 || 14,
    },
    wordmarkContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._15 || 14,
        flexWrap: 'wrap',
    },
    wordmark: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(2),
    },
    wordmarkText: {
        fontSize: verticalScale(32),
        letterSpacing: -3,
    },
    dotText: {
        textShadowColor: 'rgba(255,107,136,0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
    },
    maskedText: {
        height: verticalScale(40),
        justifyContent: 'center',
    },
    gradientWrapper: {
        width: 200,
        height: '100%',
    },
    gradientText: {
        flex: 1,
        justifyContent: 'center',
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: scale(6), // Reduced from scale(10)
        alignItems: 'center',
    },
    dot: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    dotInner: {
        width: scale(6), // Reduced from scale(8)
        height: scale(6), // Reduced from scale(8)
        borderRadius: scale(3), // Reduced from scale(6) to match smaller size
        shadowColor: '#00ffc8',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 4,
        marginTop: 10 // Reduced from 15
    },
    caption: {
        letterSpacing: 3,
        marginTop: spacingY._5 || 5,
        fontSize: 12, // Add this to make caption smaller (if not already controlled by Typo component)
    },
});

export default TypingIndicator;