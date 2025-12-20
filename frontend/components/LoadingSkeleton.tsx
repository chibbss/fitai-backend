import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

interface SkeletonProps {
    width?: number | string;
    height?: number;
    borderRadius?: number;
    style?: any;
}

/**
 * Base skeleton component with pulse animation
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    width = '100%',
    height = 20,
    borderRadius = radius._8,
    style,
}) => {
    const { colors: themeColors } = useTheme();
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                {
                    width,
                    height,
                    borderRadius,
                    backgroundColor: themeColors.border || colors.neutral200,
                    opacity,
                },
                style,
            ]}
        />
    );
};

/**
 * Skeleton for chat message loading
 */
export const ChatSkeleton: React.FC = () => {
    const { colors: themeColors } = useTheme();
    
    return (
        <View style={[styles.chatSkeleton, { backgroundColor: themeColors.cardBackground }]}>
            <Skeleton width={40} height={40} borderRadius={radius.full} />
            <View style={styles.chatSkeletonContent}>
                <Skeleton width="60%" height={16} style={{ marginBottom: spacingY._8 }} />
                <Skeleton width="80%" height={16} />
            </View>
        </View>
    );
};

/**
 * Skeleton for workout list item loading
 */
export const WorkoutSkeleton: React.FC = () => {
    const { colors: themeColors } = useTheme();
    
    return (
        <View style={[styles.workoutSkeleton, { backgroundColor: themeColors.cardBackground }]}>
            <Skeleton width="70%" height={18} style={{ marginBottom: spacingY._8 }} />
            <Skeleton width="50%" height={14} style={{ marginBottom: spacingY._12 }} />
            <View style={styles.workoutSkeletonRow}>
                <Skeleton width={60} height={14} />
                <Skeleton width={60} height={14} />
                <Skeleton width={60} height={14} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    chatSkeleton: {
        flexDirection: 'row',
        padding: spacingX._15,
        borderRadius: radius._15,
        marginBottom: spacingY._10,
        gap: spacingX._10,
    },
    chatSkeletonContent: {
        flex: 1,
        justifyContent: 'center',
    },
    workoutSkeleton: {
        padding: spacingX._20,
        borderRadius: radius._15,
        marginBottom: spacingY._15,
    },
    workoutSkeletonRow: {
        flexDirection: 'row',
        gap: spacingX._10,
    },
});

