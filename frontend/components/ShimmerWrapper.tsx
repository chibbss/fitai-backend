import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    withDelay,
    Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
export const ShimmerWrapper = ({ children }: { children: React.ReactNode }) => {
    const translateXTop = useSharedValue(-200);
    const translateXBottom = useSharedValue(400);
    useEffect(() => {
        // Top shimmer: Left to Right
        translateXTop.value = withRepeat(
            withDelay(200,
                withTiming(600, {
                    duration: 1800,
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                })
            ),
            -1
        );
        // Bottom shimmer: Right to Left
        translateXBottom.value = withRepeat(
            withDelay(200,
                withTiming(-200, {
                    duration: 1800,
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                })
            ),
            -1
        );
    }, []);
    const animatedStyleTop = useAnimatedStyle(() => ({
        transform: [{ translateX: translateXTop.value }, { skewX: '-25deg' }],
    }));
    const animatedStyleBottom = useAnimatedStyle(() => ({
        transform: [{ translateX: translateXBottom.value }, { skewX: '-25deg' }],
    }));
    return (
        <View style={styles.shimmerContainer}>
            {/* The actual button content */}
            {children}

            {/* Top Shine (Top edge) */}
            <Animated.View
                pointerEvents="none"
                style={[styles.shimmerOverlay, { top: 0 }, animatedStyleTop]}
            >
                <LinearGradient
                    colors={['transparent', 'rgba(255, 255, 255, 0.8)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradient}
                />
            </Animated.View>
            {/* Bottom Shine (Bottom edge) */}
            <Animated.View
                pointerEvents="none"
                style={[styles.shimmerOverlay, { bottom: 0 }, animatedStyleBottom]}
            >
                <LinearGradient
                    colors={['transparent', 'rgba(255, 255, 255, 0.8)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradient}
                />
            </Animated.View>
        </View>
    );
};
const styles = StyleSheet.create({
    shimmerContainer: {
        flex: 1, // CRITICAL: Allows button to fill the space and show content
        overflow: 'hidden',
        borderRadius: 30,
        position: 'relative',
        justifyContent: 'center',
        width: '100%',
    },
    shimmerOverlay: {
        position: 'absolute',
        width: 150, // Wider for more visibility
        height: '10%', // Keep to edges so text in middle stays clear
    },
    gradient: {
        flex: 1,
    },
});