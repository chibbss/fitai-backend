import React, { useMemo } from 'react';
import { View, StyleSheet, PanResponder, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, interpolateColor } from 'react-native-reanimated';
import Typo from './Typo';
import { radius, spacingX, spacingY, colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import * as Icons from 'phosphor-react-native';


type SkillSliderProps = {
    value: 'beginner' | 'intermediate' | 'advanced';
    onValueChange: (val: 'beginner' | 'intermediate' | 'advanced') => void;
};
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const SkillSlider = ({ value, onValueChange }: SkillSliderProps) => {
    const { colors: themeColors } = useTheme();
    const { width: windowWidth } = useWindowDimensions();

    // 1. Safe Width Calculation (accounting for parent padding)
    const trackWidth = windowWidth - 140; // Increased margin from edges
    const stepWidth = trackWidth / 2;

    const initialIndex = LEVELS.indexOf(value);
    const position = useSharedValue(initialIndex * stepWidth);
    const panResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
            let newPos = (initialIndex * stepWidth) + gestureState.dx;
            newPos = Math.max(0, Math.min(newPos, trackWidth));
            position.value = newPos;
        },
        onPanResponderRelease: () => {
            const index = Math.round(position.value / stepWidth);
            onValueChange(LEVELS[index]);
            position.value = withSpring(index * stepWidth, { damping: 20, stiffness: 90 });
        },
    });
    const animatedThumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: position.value - 15 }], // Offset by half thumb width
        backgroundColor: interpolateColor(
            position.value,
            [0, stepWidth, trackWidth],
            ['#2DD4BF', themeColors.accentPrimary, '#8B5CF6']
        ),
    }));
    const getDescription = () => {
        switch (value) {
            case 'beginner': return "Laying the groundwork. Learning proper form and building consistency.";
            case 'intermediate': return "Finding your rhythm. Increasing intensity and mastering complex movements.";
            case 'advanced': return "Operating at the highest level. Precision, power, and peak performance.";
            default: return "";
        }
    };
    return (
        <View style={styles.container}>
            {/* 2. Focused Label Container */}
            <View style={[styles.labels, { width: trackWidth + 20 }]}>
                {LEVELS.map((lvl) => {
                    const labelStyle = useAnimatedStyle(() => ({
                        opacity: withSpring(value === lvl ? 1 : 0.4),
                        color: value === lvl
                            ? (lvl === 'beginner' ? '#2DD4BF' : lvl === 'advanced' ? '#8B5CF6' : themeColors.accentPrimary)
                            : '#94A3B8',
                        transform: [{ scale: withSpring(value === lvl ? 1.1 : 1) }]
                    }));
                    return (
                        <Animated.Text key={lvl} style={[styles.labelBase, labelStyle]}>
                            {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                        </Animated.Text>
                    );
                })}
            </View>
            {/* Track & Thumb */}
            <View style={[styles.track, { backgroundColor: '#F1F5F9', width: trackWidth }]} {...panResponder.panHandlers}>
                <Animated.View style={[styles.thumb, animatedThumbStyle]} />
            </View>
            {/* 3. Balanced Insight Card */}
            <View style={[styles.insightCard, { backgroundColor: themeColors.cardBackground }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, }}>
                    <Icons.SparkleIcon size={24} color={themeColors.accentPrimary} weight="fill" />
                    <Typo color={themeColors.accentPrimary} size={16} fontWeight="700" style={{ marginBottom: 0, marginLeft: 10 }}>
                        INSIGHT
                    </Typo>
                </View>

                <Typo color={themeColors.textPrimary} size={16} lineHeight={24}>
                    {getDescription()}
                </Typo>
            </View>
        </View>
    );
};
const styles = StyleSheet.create({
    container: {
        paddingVertical: spacingY._20,
        alignItems: 'center',
        paddingHorizontal: 20, // Inner safe margin
    },
    labels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    labelBase: { fontSize: 15, fontWeight: '700' },
    track: { height: 10, borderRadius: 5, position: 'relative' },
    thumb: {
        width: 30, height: 30, borderRadius: 15, position: 'absolute', top: -10,
        elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6,
        borderWidth: 3, borderColor: '#FFF'
    },
    insightCard: {
        marginTop: 40,
        padding: 20,
        borderRadius: 20,
        width: '100%',
        borderWidth: 1,

        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    }
});
export default SkillSlider;