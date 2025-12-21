import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

interface EmptyCalendarStateProps {
    onLogWorkout: () => void;
    onChatWithAI?: () => void;
}

const EmptyCalendarState: React.FC<EmptyCalendarStateProps> = ({
    onLogWorkout,
    onChatWithAI
}) => {
    const { colors: themeColors } = useTheme();

    return (
        <View style={styles.container}>
            <Animated.View
                entering={FadeInDown.duration(400)}
                style={styles.content}
            >
                {/* Illustration */}
                <Animated.View
                    entering={FadeInDown.delay(100).duration(400)}
                    style={styles.illustrationContainer}
                >
                    <Icons.CalendarBlank
                        size={120}
                        color={themeColors.accentPrimary}
                        weight="duotone"
                    />
                </Animated.View>

                {/* Title */}
                <Animated.View entering={FadeInDown.delay(200).duration(400)}>
                    <View style={styles.titleContainer}>
                        <Typo
                            size={30}
                            fontWeight="800"
                            style={styles.title}
                            color={themeColors.accentPrimary}
                        >
                            Start Your Fitness Journey
                        </Typo>
                    </View>
                </Animated.View>

                {/* Description */}
                <Animated.View entering={FadeInDown.delay(300).duration(400)}>
                    <Typo
                        size={16}
                        color={themeColors.textSecondary}
                        style={styles.description}
                    >
                        Log your first workout to see your progress, track your consistency, and get AI-powered insights.
                    </Typo>
                </Animated.View>

                {/* Primary CTA */}
                <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                    <TouchableOpacity
                        onPress={onLogWorkout}
                        activeOpacity={0.8}
                        style={styles.primaryButton}
                    >
                        <LinearGradient
                            colors={themeColors.accentGradient}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.buttonGradient}
                        >
                            <Icons.Barbell size={20} color={themeColors.background} weight="bold" />
                            <Typo
                                size={18}
                                fontWeight="700"
                                color={themeColors.background}
                                style={styles.buttonText}
                            >
                                Log Your First Workout
                            </Typo>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>

                <Typo
                    size={14}
                    color={themeColors.accentPrimary}
                    fontWeight="500"
                    style={styles.secondaryButtonText}
                >
                    Or
                </Typo>

                {/* Secondary CTA */}
                {onChatWithAI && (
                    <Animated.View entering={FadeInUp.delay(500).duration(400)}>
                        <TouchableOpacity
                            onPress={onChatWithAI}
                            activeOpacity={0.7}
                            style={styles.secondaryButton}
                        >
                            <Icons.ChatCircle size={16} color={themeColors.accentPrimary} weight="regular" />
                            <Typo
                                size={14}
                                color={themeColors.accentPrimary}
                                fontWeight="500"
                                style={styles.secondaryButtonText}
                            >
                                Chat with FitAI to get personalized advice
                            </Typo>
                        </TouchableOpacity>
                    </Animated.View>
                )}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._40,
    },
    content: {
        alignItems: 'center',
        maxWidth: 320,
    },
    illustrationContainer: {
        marginBottom: spacingY._30,
        opacity: 0.8,
    },
    titleContainer: {
        marginBottom: spacingY._15,
    },
    title: {
        textAlign: 'center',
    },
    description: {
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: spacingY._30,
        paddingHorizontal: spacingX._10,
    },
    primaryButton: {
        width: '100%',
        borderRadius: radius.full,
        overflow: 'hidden',
        marginBottom: spacingY._15,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    buttonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacingY._17,
        paddingHorizontal: spacingX._30,
        gap: spacingX._10,
    },
    buttonText: {
        marginLeft: spacingX._5,
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacingY._10,
        paddingHorizontal: spacingX._15,
        gap: spacingX._7,
    },
    secondaryButtonText: {
        marginLeft: spacingX._5,
    },
});

export default EmptyCalendarState;

