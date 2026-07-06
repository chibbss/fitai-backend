import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    withSequence,
    FadeIn
} from 'react-native-reanimated';
import Typo from './Typo';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import * as Icons from 'phosphor-react-native';
const CoachResponse = ({ message }: { message: string }) => {
    const { colors: themeColors } = useTheme();

    // Typing animation
    const dotScale = useSharedValue(1);
    useEffect(() => {
        dotScale.value = withRepeat(
            withSequence(withTiming(1.4, { duration: 400 }), withTiming(1, { duration: 400 })),
            -1,
            true
        );
    }, []);
    const dotStyle = useAnimatedStyle(() => ({
        transform: [{ scale: dotScale.value }],
        opacity: dotScale.value === 1 ? 0.4 : 1,
    }));
    return (
        <View style={styles.chatRow}>
            {/* 1. Coach Icon (Fixed to Top-Left) */}
            <View style={[styles.iconContainer, { backgroundColor: themeColors.accentPrimary }]}>
                <Icons.Sparkle size={22} color={themeColors.background} weight="fill" />
            </View>
            <View style={styles.bubbleColumn}>

                {/* 3. The Talk Bubble */}
                <Animated.View
                    entering={FadeIn.delay(200)}
                    style={[styles.bubble, { backgroundColor: themeColors.cardBackground, shadowColor: "#000" }]}
                >
                    <Typo size={20} fontWeight="700" color={themeColors.textPrimary} style={{ lineHeight: 28 }}>
                        {message}
                    </Typo>

                    {/* Connector Tail */}
                    <View style={[styles.tail, { borderRightColor: themeColors.cardBackground }]} />
                </Animated.View>
            </View>
        </View>
    );
};
const styles = StyleSheet.create({
    chatRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        width: '100%',
        paddingHorizontal: spacingX._15,
        marginVertical: 10,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    bubbleColumn: {
        flex: 1,
        marginLeft: 12,
    },
    typingIndicator: {
        flexDirection: 'row',
        marginBottom: 8,
        marginLeft: 4,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    bubble: {
        padding: 24,
        borderRadius: 24,
        borderTopLeftRadius: 4, // Aligns with the tail pointing to icon
        width: '100%',
        elevation: 3,
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        position: 'relative',
    },
    tail: {
        position: 'absolute',
        top: 0,
        left: -10,
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderRightWidth: 12,
        borderBottomWidth: 12,
        borderBottomColor: 'transparent',
    }
});
export default CoachResponse;