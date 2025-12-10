import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';

interface CalendarSkeletonProps {
    calendarHeight?: number | null;
}

const CalendarSkeleton = ({ calendarHeight }: CalendarSkeletonProps) => {
    const shimmer = useSharedValue(0);

    useEffect(() => {
        shimmer.value = withRepeat(
            withTiming(1, {
                duration: 1500,
                easing: Easing.linear,
            }),
            -1,
            false
        );
    }, []);

    const shimmerStyle = useAnimatedStyle(() => {
        const translateX = interpolate(
            shimmer.value,
            [0, 1],
            [-400, 400]
        );

        return {
            transform: [{ translateX }],
        };
    });

    const SkeletonBar = ({ width, height }: { width: number; height: number }) => (
        <View style={[styles.skeletonBar, { width, height }]}>
            <Animated.View style={[styles.shimmerContainer, shimmerStyle]}>
                <LinearGradient
                    colors={[
                        'transparent',
                        'rgba(255, 255, 255, 0.4)',
                        'transparent',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradient}
                />
            </Animated.View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Month Header Skeleton - Single loader */}
            <View style={styles.header}>
                <SkeletonBar width={30} height={20} />
                <SkeletonBar width={120} height={18} />
                <SkeletonBar width={30} height={20} />
            </View>

            {/* Day Labels Skeleton - Individual loaders for each day */}
            <View style={styles.dayLabels}>
                {[...Array(7)].map((_, i) => (
                    <SkeletonBar key={i} width={35} height={12} />
                ))}
            </View>

            {/* Day Numbers Grid - Single loader covering the whole section */}
            <View style={[
                styles.gridContainer,
                calendarHeight ? { height: calendarHeight - 100 } : {} // Subtract header + labels + legend approximate height
            ]}>
                <View style={styles.gridOverlay}>
                    <Animated.View style={[styles.shimmerContainer, shimmerStyle]}>
                        <LinearGradient
                            colors={[
                                'transparent',
                                'rgba(255, 255, 255, 0.4)',
                                'transparent',
                            ]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.gradient}
                        />
                    </Animated.View>
                </View>
            </View>

            {/* Legend Skeleton */}
            <View style={styles.legend}>
                {[...Array(4)].map((_, i) => (
                    <View key={i} style={styles.legendItem}>
                        <SkeletonBar width={12} height={12} />
                        <SkeletonBar width={50} height={10} />
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._30,
        padding: spacingX._15,
        // Ensure it doesn't shrink
        alignSelf: 'stretch',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacingY._15,
    },
    dayLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: spacingY._10,
        paddingHorizontal: spacingX._5,
    },
    gridContainer: {
        backgroundColor: colors.neutral200,
        borderRadius: radius._20,
        height: 300, // Fixed height - adjust if needed
        marginBottom: spacingY._15,
        overflow: 'hidden',
        position: 'relative',
        // Remove flex: 1 completely
    },
    gridOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '200%',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacingX._15,
        marginTop: spacingY._15,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._5,
    },
    skeletonBar: {
        backgroundColor: colors.neutral300,
        borderRadius: radius._10,
        overflow: 'hidden',
        position: 'relative',
    },
    shimmerContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '200%',
    },
    gradient: {
        flex: 1,
        width: '100%',
    },
});

export default CalendarSkeleton;